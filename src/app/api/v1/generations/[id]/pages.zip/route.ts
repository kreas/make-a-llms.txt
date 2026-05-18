import { ZodError } from 'zod';
import { ApiError, apiErrorResponse, requireApiTokenOrThrow } from '@/lib/auth-guards';
import { streamPagesZip } from '@/lib/services/generations';
import { parseUid } from '@/lib/uid';

export const runtime = 'nodejs';
export const maxDuration = 300;

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
    const { stream, filename } = await streamPagesZip(uid, user.id);
    return new Response(stream, {
      status: 200,
      headers: {
        'content-type': 'application/zip',
        'content-disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
