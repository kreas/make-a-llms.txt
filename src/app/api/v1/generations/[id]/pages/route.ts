import { apiErrorResponse, requireApiTokenOrThrow } from '@/lib/auth-guards';
import { readPageManifest } from '@/lib/services/generations';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  try {
    const user = await requireApiTokenOrThrow(req);
    const { id } = await ctx.params;
    const manifest = await readPageManifest(id, user.id);
    const base = new URL(req.url);
    const root = `${base.origin}/api/v1/generations/${id}/pages`;
    return Response.json({
      ...manifest,
      pages: manifest.pages.map((p) => ({ ...p, url: `${root}/${p.path}` })),
    });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
