import { ZodError } from 'zod';
import { desc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { citationAudits } from '@/db/schema';
import { ApiError, apiErrorResponse, assertOwnsSiteByUid, requireApiTokenOrThrow } from '@/lib/auth-guards';
import { parseUid } from '@/lib/uid';
import { serializeCitationAudit } from '@/lib/citation-audit/serialize';

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
    const rows = await getDb()
      .select()
      .from(citationAudits)
      .where(eq(citationAudits.siteId, site.id))
      .orderBy(desc(citationAudits.fetchedAt));
    const seen = new Set<string>();
    const latest: typeof rows = [];
    for (const r of rows) {
      if (seen.has(r.pageUrl)) continue;
      seen.add(r.pageUrl);
      latest.push(r);
    }
    return Response.json({ audits: latest.map((r) => serializeCitationAudit(r, site.uid)) });
  } catch (err) { return apiErrorResponse(err); }
}
