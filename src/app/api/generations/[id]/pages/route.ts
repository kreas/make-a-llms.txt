import { apiErrorResponse, requireUserOrThrow } from '@/lib/auth-guards';
import { readPageManifest } from '@/lib/services/generations';
import { parseGenerationUid } from '@/lib/uid';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUserOrThrow();
    const { id } = await ctx.params;
    const uid = parseGenerationUid(id);
    const manifest = await readPageManifest(uid, user.id);
    return Response.json(manifest);
  } catch (err) {
    return apiErrorResponse(err);
  }
}
