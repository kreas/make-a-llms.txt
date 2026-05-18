import { ZodError } from 'zod';
import {
  apiErrorResponse,
  ApiError,
  assertOwnsSiteByUid,
  requireUserOrThrow,
} from '@/lib/auth-guards';
import { runCrawlerAudit } from '@/lib/crawler-audit';
import { parseUid } from '@/lib/uid';

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

export async function POST(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUserOrThrow();
    const uid = await parseSiteUid(ctx);
    const site = await assertOwnsSiteByUid(uid, user.id);
    const audit = await runCrawlerAudit({ siteId: site.id, trigger: 'manual' });
    return Response.json({ audit });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
