import { apiErrorResponse, ApiError, requireUserOrThrow } from '@/lib/auth-guards';
import { readPageManifest } from '@/lib/services/generations';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUserOrThrow();
    const { id } = await ctx.params;
    const manifest = await readPageManifest(id, user.id);
    return Response.json(manifest);
  } catch (err) {
    return apiErrorResponse(err);
  }
}
