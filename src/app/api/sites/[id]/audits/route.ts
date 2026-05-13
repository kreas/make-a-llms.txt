import {
  apiErrorResponse,
  ApiError,
  assertOwnsSite,
  requireUserOrThrow,
} from '@/lib/auth-guards';
import { runCrawlerAudit } from '@/lib/crawler-audit';

type Ctx = { params: Promise<{ id: string }> };

async function parseSiteId(ctx: Ctx): Promise<number> {
  const { id } = await ctx.params;
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) throw new ApiError(404, 'not_found', 'Site not found');
  return n;
}

export async function POST(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUserOrThrow();
    const id = await parseSiteId(ctx);
    await assertOwnsSite(id, user.id);
    const audit = await runCrawlerAudit({ siteId: id, trigger: 'manual' });
    return Response.json({ audit });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
