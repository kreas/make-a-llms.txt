import { head } from '@vercel/blob';
import {
  apiErrorResponse,
  ApiError,
  assertOwnsGeneration,
  requireUserOrThrow,
} from '@/lib/auth-guards';

type Ctx = { params: Promise<{ id: string; kind: string }> };

const KINDS = { llms: 'llmsBlobPath', 'llms-full': 'llmsFullBlobPath' } as const;
type Kind = keyof typeof KINDS;

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const { id, kind } = await ctx.params;
    if (!(kind in KINDS)) {
      throw new ApiError(400, 'validation', `Invalid kind: ${kind}`);
    }
    const user = await requireUserOrThrow();
    const n = Number(id);
    if (!Number.isInteger(n) || n <= 0) {
      throw new ApiError(404, 'not_found', 'Generation not found');
    }
    const gen = await assertOwnsGeneration(n, user.id);
    const pathField = KINDS[kind as Kind];
    const blobPath = gen[pathField];
    if (!blobPath) throw new ApiError(404, 'not_found', 'File not ready');

    const meta = await head(`https://blob.vercel-storage.com/${blobPath}`);
    const downstream = await fetch(meta.url);
    if (!downstream.ok) {
      throw new ApiError(502, 'storage_error', 'Failed to fetch blob');
    }

    const filename = kind === 'llms' ? 'llms.txt' : 'llms-full.txt';
    return new Response(downstream.body, {
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
