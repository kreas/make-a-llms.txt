import { apiErrorResponse, requireApiTokenOrThrow } from '@/lib/auth-guards';
import { cancelGeneration } from '@/lib/services/generations';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  try {
    const user = await requireApiTokenOrThrow(req);
    const { id } = await ctx.params;
    const generation = await cancelGeneration(id, user.id);
    return Response.json({ generation });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
