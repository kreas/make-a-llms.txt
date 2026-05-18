import { apiErrorResponse, requireApiTokenOrThrow } from '@/lib/auth-guards';
import { readGenerationFile } from '@/lib/services/generations';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  try {
    const user = await requireApiTokenOrThrow(req);
    const { id } = await ctx.params;
    const { stream, filename } = await readGenerationFile(id, user.id, 'llms');
    return new Response(stream, {
      status: 200,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'content-disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
