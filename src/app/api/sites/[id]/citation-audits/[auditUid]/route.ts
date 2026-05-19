import { ZodError } from 'zod';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { citationAudits } from '@/db/schema';
import { ApiError, apiErrorResponse, assertOwnsSiteByUid, requireUserOrThrow } from '@/lib/auth-guards';
import { parseUid } from '@/lib/uid';
import { serializeCitationAudit } from '@/lib/citation-audit/serialize';

type Ctx = { params: Promise<{ id: string; auditUid: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUserOrThrow();
    const { id, auditUid } = await ctx.params;

    let siteUid: string;
    try {
      siteUid = parseUid(id);
    } catch (e) {
      if (e instanceof ZodError) throw new ApiError(400, 'validation', 'Site id must be a UUID');
      throw e;
    }

    let aUid: string;
    try {
      aUid = parseUid(auditUid);
    } catch (e) {
      if (e instanceof ZodError) throw new ApiError(400, 'validation', 'Audit id must be a UUID');
      throw e;
    }

    const site = await assertOwnsSiteByUid(siteUid, user.id);
    const [audit] = await getDb()
      .select()
      .from(citationAudits)
      .where(and(eq(citationAudits.siteId, site.id), eq(citationAudits.uid, aUid)));
    if (!audit) throw new ApiError(404, 'not_found', 'Audit not found');
    return Response.json({ audit: serializeCitationAudit(audit, siteUid) });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
