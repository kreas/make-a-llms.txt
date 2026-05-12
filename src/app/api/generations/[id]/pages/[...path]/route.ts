import { get } from '@vercel/blob';
import {
  apiErrorResponse,
  ApiError,
  assertOwnsGeneration,
  requireUserOrThrow,
} from '@/lib/auth-guards';

type Ctx = { params: Promise<{ id: string; path: string[] }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUserOrThrow();
    const { id, path } = await ctx.params;
    const n = Number(id);
    if (!Number.isInteger(n) || n <= 0) {
      throw new ApiError(404, 'not_found', 'Generation not found');
    }
    const gen = await assertOwnsGeneration(n, user.id);

    if (!gen.pagesManifestBlobPath) {
      throw new ApiError(404, 'not_found', 'No pages for this generation');
    }

    const manifestBlob = await get(gen.pagesManifestBlobPath, { access: 'private' });
    if (!manifestBlob) throw new ApiError(404, 'not_found', 'Manifest missing');
    const manifest = JSON.parse(await new Response(manifestBlob.stream).text()) as {
      pages: Array<{ path: string | null; blobPath: string | null; status: string }>;
    };

    const wanted = path.join('/').replace(/\.md$/, '');
    const entry = manifest.pages.find((p) => p.path === wanted && p.status === 'ok');
    if (!entry || !entry.blobPath) {
      throw new ApiError(404, 'not_found', 'Page not found');
    }

    const blob = await get(entry.blobPath, { access: 'private' });
    if (!blob) throw new ApiError(404, 'not_found', 'Page blob missing');

    return new Response(blob.stream, {
      status: 200,
      headers: {
        'content-type': 'text/markdown; charset=utf-8',
        'content-disposition': 'inline',
      },
    });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
