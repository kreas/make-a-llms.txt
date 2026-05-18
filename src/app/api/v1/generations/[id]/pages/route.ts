import { ZodError } from 'zod';
import { ApiError, apiErrorResponse, requireApiTokenOrThrow } from '@/lib/auth-guards';
import { readPageManifest } from '@/lib/services/generations';
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
    const manifest = await readPageManifest(uid, user.id);
    const base = new URL(req.url);
    const root = `${base.origin}/api/v1/generations/${uid}/pages`;
    return Response.json({
      ...manifest,
      pages: manifest.pages.map((p) => ({ ...p, url: `${root}/${p.path}` })),
    });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
