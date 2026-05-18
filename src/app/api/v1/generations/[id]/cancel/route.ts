import { ZodError } from 'zod';
import { ApiError, apiErrorResponse, requireApiTokenOrThrow } from '@/lib/auth-guards';
import { cancelGeneration } from '@/lib/services/generations';
import { getSiteUidById } from '@/lib/services/sites';
import { parseUid } from '@/lib/uid';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  try {
    const user = await requireApiTokenOrThrow(req);
    const { id } = await ctx.params;
    let uid: string;
    try { uid = parseUid(id); } catch (err) {
      if (err instanceof ZodError) throw new ApiError(400, 'validation', 'Generation id must be a UUID');
      throw err;
    }
    const g = await cancelGeneration(uid, user.id);
    const siteUid = await getSiteUidById(g.siteId);
    return Response.json({
      generation: {
        id: g.uid,
        siteId: siteUid ?? '',
        status: g.status,
        completedAt: g.completedAt,
      },
    });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
