import { ZodError } from 'zod';
import { ApiError, apiErrorResponse, requireApiTokenOrThrow } from '@/lib/auth-guards';
import { readPageMarkdown } from '@/lib/services/generations';
import { parseUid } from '@/lib/uid';

type Ctx = { params: Promise<{ id: string; path: string[] }> };

export async function GET(req: Request, ctx: Ctx) {
  try {
    const user = await requireApiTokenOrThrow(req);
    const { id, path } = await ctx.params;
    let uid: string;
    try { uid = parseUid(id); } catch (err) {
      if (err instanceof ZodError) throw new ApiError(400, 'validation', 'Generation id must be a UUID');
      throw err;
    }
    const stream = await readPageMarkdown(uid, user.id, path.join('/'));
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
