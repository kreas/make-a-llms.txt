import {
  apiErrorResponse,
  assertOwnsGenerationByUid,
  requireUserOrThrow,
} from '@/lib/auth-guards';
import { parseGenerationUid } from '@/lib/uid';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUserOrThrow();
    const { id } = await ctx.params;
    const uid = parseGenerationUid(id);
    const generation = await assertOwnsGenerationByUid(uid, user.id);

    const downloads: { llms?: string; llmsFull?: string } = {};
    if (generation.llmsBlobPath) downloads.llms = `/api/generations/${generation.uid}/files/llms`;
    if (generation.llmsFullBlobPath) {
      downloads.llmsFull = `/api/generations/${generation.uid}/files/llms-full`;
    }

    return Response.json({ generation, downloads });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
