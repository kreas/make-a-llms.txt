import {
  apiErrorResponse,
  requireUserOrThrow,
} from '@/lib/auth-guards';
import { cancelGeneration } from '@/lib/services/generations';
import { parseGenerationUid } from '@/lib/uid';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUserOrThrow();
    const { id } = await ctx.params;
    const uid = parseGenerationUid(id);
    const generation = await cancelGeneration(uid, user.id);
    return Response.json({ generation });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
