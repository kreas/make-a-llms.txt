import { ZodError } from 'zod';
import { ApiError, apiErrorResponse, assertOwnsSiteByUid, requireUserOrThrow } from '@/lib/auth-guards';
import { parseUid } from '@/lib/uid';
import { runGeoAudit } from '@/lib/geo-audit/run';
import { serializeSiteGeoAudit } from '@/lib/geo-audit/serialize';

export const maxDuration = 60;

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
    const audit = await runGeoAudit({ siteId: site.id });
    return Response.json({ audit: serializeSiteGeoAudit(audit, uid) });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
