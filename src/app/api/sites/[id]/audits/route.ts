import {
  apiErrorResponse,
  assertOwnsSiteByUid,
  requireUserOrThrow,
} from '@/lib/auth-guards';
import { runCrawlerAudit } from '@/lib/crawler-audit';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUserOrThrow();
    const { id } = await ctx.params;
    const site = await assertOwnsSiteByUid(id, user.id);
    const audit = await runCrawlerAudit({ siteId: site.id, trigger: 'manual' });
    return Response.json({ audit });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
