import {
  apiErrorResponse,
  requireUserOrThrow,
} from '@/lib/auth-guards';
import { streamPagesZip } from '@/lib/services/generations';
import { parseGenerationUid } from '@/lib/uid';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUserOrThrow();
    const { id } = await ctx.params;
    const uid = parseGenerationUid(id);
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
