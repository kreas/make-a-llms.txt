import { ZodError } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { siteGeoAudits } from '@/db/schema';
import { ApiError, apiErrorResponse, assertOwnsSiteByUid, requireUserOrThrow } from '@/lib/auth-guards';
import { parseUid } from '@/lib/uid';
import { serializeSiteGeoAudit } from '@/lib/geo-audit/serialize';

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
    const db = getDb();
    const [succeeded] = await db
      .select()
      .from(siteGeoAudits)
      .where(and(eq(siteGeoAudits.siteId, site.id), eq(siteGeoAudits.status, 'succeeded')))
      .orderBy(desc(siteGeoAudits.fetchedAt))
      .limit(1);
    if (succeeded) {
      return Response.json({ audit: serializeSiteGeoAudit(succeeded, uid) });
    }
    const [latestAny] = await db
      .select()
      .from(siteGeoAudits)
      .where(eq(siteGeoAudits.siteId, site.id))
      .orderBy(desc(siteGeoAudits.fetchedAt))
      .limit(1);
    return Response.json({ audit: latestAny ? serializeSiteGeoAudit(latestAny, uid) : null });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
