import { ZodError } from 'zod';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { sites } from '@/db/schema';
import {
  apiErrorResponse,
  ApiError,
  assertOwnsSiteByUid,
  requireUserOrThrow,
} from '@/lib/auth-guards';
import { updateSiteSchema } from '@/lib/validators';
import { parseUid } from '@/lib/uid';
import { toPublicSite } from '@/lib/services/sites';

type Ctx = { params: Promise<{ id: string }> };

async function parseSiteUid(ctx: Ctx): Promise<string> {
  const { id } = await ctx.params;
  try {
    return parseUid(id);
  } catch (e) {
    if (e instanceof ZodError) throw new ApiError(400, 'validation', 'Site id must be a UUID');
    throw e;
  }
}

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUserOrThrow();
    const uid = await parseSiteUid(ctx);
    const site = await assertOwnsSiteByUid(uid, user.id);
    return Response.json({ site: toPublicSite(site) });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const user = await requireUserOrThrow();
    const uid = await parseSiteUid(ctx);
    const site = await assertOwnsSiteByUid(uid, user.id);
    const body = updateSiteSchema.parse(await req.json());

    const [updated] = await getDb()
      .update(sites)
      .set({ ...body, updatedAt: new Date().toISOString() })
      .where(eq(sites.id, site.id))
      .returning();

    return Response.json({ site: toPublicSite(updated) });
  } catch (err) {
    if (err instanceof Error && err.name === 'ZodError') {
      return apiErrorResponse(new ApiError(400, 'validation', err.message));
    }
    return apiErrorResponse(err);
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUserOrThrow();
    const uid = await parseSiteUid(ctx);
    const site = await assertOwnsSiteByUid(uid, user.id);
    await getDb().delete(sites).where(eq(sites.id, site.id));
    return new Response(null, { status: 204 });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
