import { ZodError } from 'zod';
import { and, desc, eq, lt } from 'drizzle-orm';
import { getDb } from '@/db';
import { citationAudits } from '@/db/schema';
import { ApiError, apiErrorResponse, assertOwnsSiteByUid, requireApiTokenOrThrow } from '@/lib/auth-guards';
import { parseUid } from '@/lib/uid';
import { runCitationAudit } from '@/lib/citation-audit';
import { serializeCitationAudit } from '@/lib/citation-audit/serialize';
import { runCitationAuditBodySchema, listCitationAuditsQuerySchema } from '@/lib/validators/citation-audits';
import { assertPageUrlInLatestManifest } from '@/lib/citation-audit/manifest-membership';

export const maxDuration = 30;

type Ctx = { params: Promise<{ id: string }> };

async function parseSiteUid(ctx: Ctx): Promise<string> {
  const { id } = await ctx.params;
  try { return parseUid(id); } catch (e) {
    if (e instanceof ZodError) throw new ApiError(400, 'validation', 'Site id must be a UUID');
    throw e;
  }
}

export async function GET(req: Request, ctx: Ctx) {
  try {
    const user = await requireApiTokenOrThrow(req);
    const uid = await parseSiteUid(ctx);
    const site = await assertOwnsSiteByUid(uid, user.id);
    const url = new URL(req.url);
    const parsed = listCitationAuditsQuerySchema.safeParse({
      pageUrl: url.searchParams.get('pageUrl') ?? undefined,
      limit: url.searchParams.get('limit') ?? undefined,
      cursor: url.searchParams.get('cursor') ?? undefined,
    });
    if (!parsed.success) throw new ApiError(400, 'validation', parsed.error.message);
    const { pageUrl, limit, cursor } = parsed.data;
    const conditions = cursor
      ? and(
          eq(citationAudits.siteId, site.id),
          eq(citationAudits.pageUrl, pageUrl),
          lt(citationAudits.fetchedAt, cursor),
        )
      : and(eq(citationAudits.siteId, site.id), eq(citationAudits.pageUrl, pageUrl));
    const rows = await getDb()
      .select()
      .from(citationAudits)
      .where(conditions)
      .orderBy(desc(citationAudits.fetchedAt))
      .limit(limit);
    const nextCursor = rows.length === limit ? rows[rows.length - 1].fetchedAt : null;
    return Response.json({
      audits: rows.map((r) => serializeCitationAudit(r, site.uid)),
      nextCursor,
    });
  } catch (err) { return apiErrorResponse(err); }
}

export async function POST(req: Request, ctx: Ctx) {
  try {
    const user = await requireApiTokenOrThrow(req);
    const uid = await parseSiteUid(ctx);
    const site = await assertOwnsSiteByUid(uid, user.id);
    const body = runCitationAuditBodySchema.safeParse(await req.json());
    if (!body.success) throw new ApiError(400, 'validation', body.error.message);
    await assertPageUrlInLatestManifest(site.id, body.data.pageUrl);
    const audit = await runCitationAudit({ siteId: site.id, pageUrl: body.data.pageUrl });
    return Response.json({ audit: serializeCitationAudit(audit, site.uid) });
  } catch (err) { return apiErrorResponse(err); }
}
