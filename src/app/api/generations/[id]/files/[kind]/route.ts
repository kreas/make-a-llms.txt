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
    const { stream, filename } = await readGenerationFile(id, user.id, kind as GenerationFileKind);
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
