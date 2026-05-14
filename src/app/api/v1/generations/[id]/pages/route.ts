import { ApiError, apiErrorResponse, requireApiTokenOrThrow } from '@/lib/auth-guards';
import { readPageManifest } from '@/lib/services/generations';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  try {
    const user = await requireApiTokenOrThrow(req);
    const { id } = await ctx.params;
    const n = Number(id);
    if (!Number.isInteger(n) || n <= 0) {
      throw new ApiError(404, 'not_found', 'Generation not found');
    }
    const manifest = await readPageManifest(n, user.id);
    const base = new URL(req.url);
    const root = `${base.origin}/api/v1/generations/${n}/pages`;
    return Response.json({
      ...manifest,
      pages: manifest.pages.map((p) => ({ ...p, url: `${root}/${p.path}` })),
    });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
