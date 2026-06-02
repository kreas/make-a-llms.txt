import { ZodError } from 'zod';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { pageSummaryCache } from '@/db/schema';
import { ApiError, apiErrorResponse, assertOwnsSiteByUid, requireUserOrThrow } from '@/lib/auth-guards';
import { parseUid } from '@/lib/uid';
import { classifyFromSignals } from '@/lib/geo-audit/classify';

export const maxDuration = 30;

type Ctx = { params: Promise<{ id: string }> };

async function parseSiteUid(ctx: Ctx): Promise<string> {
  const { id } = await ctx.params;
  try { return parseUid(id); } catch (e) {
    if (e instanceof ZodError) throw new ApiError(400, 'validation', 'Site id must be a UUID');
    throw e;
  }
}

export async function POST(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUserOrThrow();
    const uid = await parseSiteUid(ctx);
    const site = await assertOwnsSiteByUid(uid, user.id);

    const rows = await getDb()
      .select({ pageType: pageSummaryCache.pageType })
      .from(pageSummaryCache)
      .where(eq(pageSummaryCache.siteId, site.id));
    const histogram: Record<string, number> = {};
    for (const r of rows) histogram[r.pageType] = (histogram[r.pageType] ?? 0) + 1;

    const { siteType, confidence } = await classifyFromSignals({
      histogram,
      description: site.description ?? null,
      entityName: site.displayName ?? site.name,
    });
    return Response.json({ suggestedType: siteType, confidence });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
