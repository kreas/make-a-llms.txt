import {
  apiErrorResponse,
  ApiError,
  requireUserOrThrow,
} from '@/lib/auth-guards';
import { readGenerationFile, type GenerationFileKind } from '@/lib/services/generations';

type Ctx = { params: Promise<{ id: string; kind: string }> };

const VALID_KINDS: GenerationFileKind[] = ['llms', 'llms-full'];

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const { id, kind } = await ctx.params;
    if (!(VALID_KINDS as string[]).includes(kind)) {
      throw new ApiError(400, 'validation', `Invalid kind: ${kind}`);
    }
    const user = await requireUserOrThrow();
    const n = Number(id);
    if (!Number.isInteger(n) || n <= 0) {
      throw new ApiError(404, 'not_found', 'Generation not found');
    }
    const { stream, filename } = await readGenerationFile(n, user.id, kind as GenerationFileKind);
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
