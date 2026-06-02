import { ZodError } from 'zod';
import { ApiError, apiErrorResponse, assertOwnsSiteByUid, requireUserOrThrow } from '@/lib/auth-guards';
import { parseUid } from '@/lib/uid';
import { getDb } from '@/db';
import { sites } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { enqueueGeoAudit } from '@/lib/geo-audit/enqueue';
import { serializeSiteGeoAudit } from '@/lib/geo-audit/serialize';
import { runGeoAuditBodySchema } from '@/lib/validators/geo-audit';

export const maxDuration = 30;

type Ctx = { params: Promise<{ id: string }> };

async function parseSiteUid(ctx: Ctx): Promise<string> {
  const { id } = await ctx.params;
  try { return parseUid(id); } catch (e) {
    if (e instanceof ZodError) throw new ApiError(400, 'validation', 'Site id must be a UUID');
    throw e;
  }
}

export async function POST(req: Request, ctx: Ctx) {
  try {
    const user = await requireUserOrThrow();
    const uid = await parseSiteUid(ctx);
    const site = await assertOwnsSiteByUid(uid, user.id);
    const body = runGeoAuditBodySchema.safeParse(await req.json());
    if (!body.success) throw new ApiError(400, 'validation', body.error.message);

    await getDb().update(sites).set({ siteType: body.data.siteType, geoGoal: body.data.goal }).where(eq(sites.id, site.id));

    const audit = await enqueueGeoAudit({ siteId: site.id, siteType: body.data.siteType, goal: body.data.goal });
    return Response.json({ audit: serializeSiteGeoAudit(audit, uid) });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
