import { ZodError } from 'zod';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db';
import { robotsGeneratorDrafts } from '@/db/schema';
import {
  apiErrorResponse,
  ApiError,
  assertOwnsSiteByUid,
  requireUserOrThrow,
} from '@/lib/auth-guards';
import { parseUid } from '@/lib/uid';

type Ctx = { params: Promise<{ id: string }> };

const putBodySchema = z.object({
  toggles: z.record(z.string(), z.enum(['allow', 'block', 'default'])),
  allowAll: z.boolean().optional(),
});

async function parseSiteUid(ctx: Ctx): Promise<string> {
  const { id } = await ctx.params;
  try {
    return parseUid(id);
  } catch (e) {
    if (e instanceof ZodError) throw new ApiError(400, 'validation', 'Site id must be a UUID');
    throw e;
  }
}

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUserOrThrow();
    const uid = await parseSiteUid(ctx);
    const site = await assertOwnsSiteByUid(uid, user.id);

    const [draft] = await getDb()
      .select()
      .from(robotsGeneratorDrafts)
      .where(eq(robotsGeneratorDrafts.siteId, site.id))
      .limit(1);

    if (!draft) throw new ApiError(404, 'not_found', 'No draft yet');
    return Response.json({ draft });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function PUT(req: Request, ctx: Ctx) {
  try {
    const user = await requireUserOrThrow();
    const uid = await parseSiteUid(ctx);
    const site = await assertOwnsSiteByUid(uid, user.id);
    const body = putBodySchema.parse(await req.json());

    const db = getDb();
    const togglesJson = JSON.stringify(body.toggles);
    const allowAll = body.allowAll ?? false;
    const now = new Date().toISOString();

    const [draft] = await db
      .insert(robotsGeneratorDrafts)
      .values({ siteId: site.id, toggles: togglesJson, allowAll, updatedAt: now })
      .onConflictDoUpdate({
        target: robotsGeneratorDrafts.siteId,
        set: { toggles: togglesJson, allowAll, updatedAt: now },
      })
      .returning();

    return Response.json({ draft });
  } catch (err) {
    if (err instanceof Error && err.name === 'ZodError') {
      return apiErrorResponse(new ApiError(400, 'validation', err.message));
    }
    return apiErrorResponse(err);
  }
}
