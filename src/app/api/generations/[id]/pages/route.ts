import { get } from '@vercel/blob';
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
    const gen = await assertOwnsGeneration(n, user.id);

    if (!gen.pagesManifestBlobPath) {
      return Response.json({
        status: gen.pagesStatus,
        reason: gen.pagesErrorMessage ?? undefined,
        pages: [],
      });
    }

    const blob = await get(gen.pagesManifestBlobPath, { access: 'private' });
    if (!blob) {
      return Response.json({ status: gen.pagesStatus, pages: [] });
    }
    const text = await new Response(blob.stream).text();
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new ApiError(404, 'not_found', 'Manifest unreadable');
    }
    return Response.json({ status: gen.pagesStatus, ...parsed });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
