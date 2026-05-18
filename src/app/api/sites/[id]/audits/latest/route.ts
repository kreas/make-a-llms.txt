import { desc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { crawlerAudits } from '@/db/schema';
import {
  ApiError,
  apiErrorResponse,
  assertOwnsSiteByUid,
  requireUserOrThrow,
} from '@/lib/auth-guards';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUserOrThrow();
    const { id } = await ctx.params;
    const site = await assertOwnsSiteByUid(id, user.id);

    const [audit] = await getDb()
      .select()
      .from(crawlerAudits)
      .where(eq(crawlerAudits.siteId, site.id))
      .orderBy(desc(crawlerAudits.fetchedAt))
      .limit(1);

    if (!audit) throw new ApiError(404, 'not_found', 'No audit yet');
    return Response.json({ audit });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
