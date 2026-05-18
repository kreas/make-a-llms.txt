import { ZodError } from 'zod';
import { desc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { crawlerAudits } from '@/db/schema';
import {
  ApiError,
  apiErrorResponse,
  assertOwnsSiteByUid,
  requireUserOrThrow,
} from '@/lib/auth-guards';
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

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUserOrThrow();
    const uid = await parseSiteUid(ctx);
    const site = await assertOwnsSiteByUid(uid, user.id);

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
