import { ZodError } from 'zod';
import { and, eq, desc, inArray } from 'drizzle-orm';
import { getDb } from '@/db';
import { siteTasks, citationAudits, siteGeoAudits, type SiteTask } from '@/db/schema';
import { ApiError, apiErrorResponse, assertOwnsSiteByUid, requireUserOrThrow } from '@/lib/auth-guards';
import { parseUid } from '@/lib/uid';
import { createSiteTaskBodySchema } from '@/lib/validators/site-tasks';
import { citationPassedKeys, geoPassedKeys, findVerifiableUids } from '@/lib/tasks/reconcile';
import { serializeSiteTask } from '@/lib/tasks/serialize';

type Ctx = { params: Promise<{ id: string }> };

async function parseSiteUid(ctx: Ctx): Promise<string> {
  const { id } = await ctx.params;
  try {
    return parseUid(id);
  } catch (e) {
    if (e instanceof ZodError) throw new ApiError(400, 'validation', 'Site id must be a UUID');
    throw e;
  }
}

function parseResultsOrNull<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null; // corrupt audit blob — skip reconciliation for this source
  }
}

const STATUS_ORDER: Record<SiteTask['status'], number> = {
  open: 0,
  done: 1,
  verified: 2,
  wont_do: 3,
};

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUserOrThrow();
    const uid = await parseSiteUid(ctx);
    const site = await assertOwnsSiteByUid(uid, user.id);
    const db = getDb();

    let tasks = await db.select().from(siteTasks).where(eq(siteTasks.siteId, site.id));
    const candidates = tasks.filter((t) => t.status === 'open' || t.status === 'done');
    const passedKeys = new Set<string>();

    // Citation adapter: latest succeeded audit per page among the candidates.
    const citationPages = [
      ...new Set(candidates.filter((t) => t.sourceType === 'citation-check').map((t) => t.pageUrl)),
    ];
    for (const pageUrl of citationPages) {
      const [latest] = await db
        .select()
        .from(citationAudits)
        .where(
          and(
            eq(citationAudits.siteId, site.id),
            eq(citationAudits.pageUrl, pageUrl),
            eq(citationAudits.status, 'succeeded'),
          ),
        )
        .orderBy(desc(citationAudits.fetchedAt))
        .limit(1);
      if (latest?.results) {
        const parsed = parseResultsOrNull<{ checks: { id: string; passed: boolean }[] }>(
          latest.results,
        );
        if (parsed) {
          for (const k of citationPassedKeys(pageUrl, parsed)) passedKeys.add(k);
        }
      }
    }

    // Geo adapter: latest succeeded site-level geo audit.
    if (candidates.some((t) => t.sourceType === 'geo-signal')) {
      const [latestGeo] = await db
        .select()
        .from(siteGeoAudits)
        .where(and(eq(siteGeoAudits.siteId, site.id), eq(siteGeoAudits.status, 'succeeded')))
        .orderBy(desc(siteGeoAudits.fetchedAt))
        .limit(1);
      if (latestGeo?.results) {
        const parsed = parseResultsOrNull<{ signals: { signal: string; present: boolean }[] }>(
          latestGeo.results,
        );
        if (parsed) {
          for (const k of geoPassedKeys(parsed)) passedKeys.add(k);
        }
      }
    }
    // crawler-audit / setup tasks have no reconciler yet: manual completion only.

    const toVerify = findVerifiableUids(candidates, passedKeys);
    if (toVerify.length > 0) {
      await db
        .update(siteTasks)
        .set({ status: 'verified', statusChangedAt: new Date().toISOString() })
        .where(inArray(siteTasks.uid, toVerify));
      tasks = await db.select().from(siteTasks).where(eq(siteTasks.siteId, site.id));
    }

    const ordered = [...tasks].sort(
      (a, b) =>
        STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
        b.createdAt.localeCompare(a.createdAt),
    );
    return Response.json({ tasks: ordered.map(serializeSiteTask) });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function POST(req: Request, ctx: Ctx) {
  try {
    const user = await requireUserOrThrow();
    const uid = await parseSiteUid(ctx);
    const site = await assertOwnsSiteByUid(uid, user.id);
    const body = createSiteTaskBodySchema.safeParse(await req.json());
    if (!body.success) throw new ApiError(400, 'validation', body.error.message);
    const { sourceType, sourceId, pageUrl, title, foundText, fixText } = body.data;
    const db = getDb();

    const sourceKeyWhere = and(
      eq(siteTasks.siteId, site.id),
      eq(siteTasks.sourceType, sourceType),
      eq(siteTasks.sourceId, sourceId),
      eq(siteTasks.pageUrl, pageUrl),
    );
    const [existing] = await db.select().from(siteTasks).where(sourceKeyWhere);
    if (existing) return Response.json({ task: serializeSiteTask(existing) });

    try {
      const [created] = await db
        .insert(siteTasks)
        .values({ siteId: site.id, sourceType, sourceId, pageUrl, title, foundText, fixText })
        .returning();
      return Response.json({ task: serializeSiteTask(created) });
    } catch {
      // Unique-key race: a concurrent request inserted between select and insert.
      const [raced] = await db.select().from(siteTasks).where(sourceKeyWhere);
      if (raced) return Response.json({ task: serializeSiteTask(raced) });
      throw new ApiError(500, 'internal', 'Failed to create task');
    }
  } catch (err) {
    return apiErrorResponse(err);
  }
}
