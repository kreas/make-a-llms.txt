import { ZodError } from 'zod';
import { ApiError, apiErrorResponse, requireApiTokenOrThrow } from '@/lib/auth-guards';
import { getGenerationView } from '@/lib/services/generations';
import { parseUid } from '@/lib/uid';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  try {
    const user = await requireApiTokenOrThrow(req);
    const { id } = await ctx.params;
    let uid: string;
    try {
      uid = parseUid(id);
    } catch (err) {
      if (err instanceof ZodError) {
        throw new ApiError(400, 'validation', 'Generation id must be a UUID');
      }
      throw err;
    }
    const view = await getGenerationView(uid, user.id);
    const base = new URL(req.url);
    const root = `${base.origin}/api/v1/generations/${uid}`;
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
