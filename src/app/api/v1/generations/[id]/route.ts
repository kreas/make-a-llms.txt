import { ApiError, apiErrorResponse, requireApiTokenOrThrow } from '@/lib/auth-guards';
import { getGenerationView } from '@/lib/services/generations';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  try {
    const user = await requireApiTokenOrThrow(req);
    const { id } = await ctx.params;
    const n = Number(id);
    if (!Number.isInteger(n) || n <= 0) {
      throw new ApiError(404, 'not_found', 'Generation not found');
    }
    const view = await getGenerationView(n, user.id);
    const base = new URL(req.url);
    const root = `${base.origin}/api/v1/generations/${n}`;
    return Response.json({
      ...view,
      files: {
        llms: { ready: view.files.llms.ready, url: view.files.llms.ready ? `${root}/llms.txt` : undefined },
        llmsFull: { ready: view.files.llmsFull.ready, url: view.files.llmsFull.ready ? `${root}/llms-full.txt` : undefined },
        pages: { ready: view.files.pages.ready, url: view.files.pages.ready ? `${root}/pages` : undefined },
      },
    });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
