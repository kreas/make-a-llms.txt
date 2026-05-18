import { ZodError } from 'zod';
import { ApiError, apiErrorResponse, requireApiTokenOrThrow } from '@/lib/auth-guards';
import { readGenerationFile } from '@/lib/services/generations';
import { parseUid } from '@/lib/uid';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  try {
    const user = await requireApiTokenOrThrow(req);
    const { id } = await ctx.params;
    let uid: string;
    try { uid = parseUid(id); } catch (err) {
      if (err instanceof ZodError) throw new ApiError(400, 'validation', 'Generation id must be a UUID');
      throw err;
    }
    const { stream, filename } = await readGenerationFile(uid, user.id, 'llms-full');
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
