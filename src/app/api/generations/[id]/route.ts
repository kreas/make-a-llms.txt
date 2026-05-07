import {
  apiErrorResponse,
  ApiError,
  assertOwnsGeneration,
  requireUserOrThrow,
} from '@/lib/auth-guards';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUserOrThrow();
    const { id } = await ctx.params;
    const n = Number(id);
    if (!Number.isInteger(n) || n <= 0) {
      throw new ApiError(404, 'not_found', 'Generation not found');
    }
    const generation = await assertOwnsGeneration(n, user.id);

    const downloads: { llms?: string; llmsFull?: string } = {};
    if (generation.llmsBlobPath) downloads.llms = `/api/generations/${generation.id}/files/llms`;
    if (generation.llmsFullBlobPath) {
      downloads.llmsFull = `/api/generations/${generation.id}/files/llms-full`;
    }

    return Response.json({ generation, downloads });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
