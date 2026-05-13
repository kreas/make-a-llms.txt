import { desc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { crawlerAudits } from '@/db/schema';
import {
  apiErrorResponse,
  ApiError,
  assertOwnsSite,
  requireUserOrThrow,
} from '@/lib/auth-guards';

type Ctx = { params: Promise<{ id: string }> };

async function parseSiteId(ctx: Ctx): Promise<number> {
  const { id } = await ctx.params;
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) throw new ApiError(404, 'not_found', 'Site not found');
  return n;
}

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUserOrThrow();
    const id = await parseSiteId(ctx);
    await assertOwnsSite(id, user.id);

    const [audit] = await getDb()
      .select()
      .from(crawlerAudits)
      .where(eq(crawlerAudits.siteId, id))
      .orderBy(desc(crawlerAudits.fetchedAt))
      .limit(1);

    if (!audit) throw new ApiError(404, 'not_found', 'No audit yet');
    return Response.json({ audit });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
