import { apiErrorResponse, requireUserOrThrow } from '@/lib/auth-guards';
import { readPageMarkdown } from '@/lib/services/generations';
import { parseGenerationUid } from '@/lib/uid';

type Ctx = { params: Promise<{ id: string; path: string[] }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUserOrThrow();
    const { id, path } = await ctx.params;
    const uid = parseGenerationUid(id);
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
