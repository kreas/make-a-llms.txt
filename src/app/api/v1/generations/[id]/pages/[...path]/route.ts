import { ApiError, apiErrorResponse, requireApiTokenOrThrow } from '@/lib/auth-guards';
import { readPageMarkdown } from '@/lib/services/generations';

type Ctx = { params: Promise<{ id: string; path: string[] }> };

export async function GET(req: Request, ctx: Ctx) {
  try {
    const user = await requireApiTokenOrThrow(req);
    const { id, path } = await ctx.params;
    const n = Number(id);
    if (!Number.isInteger(n) || n <= 0) {
      throw new ApiError(404, 'not_found', 'Generation not found');
    }
    const stream = await readPageMarkdown(n, user.id, path.join('/'));
    return new Response(stream, {
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
