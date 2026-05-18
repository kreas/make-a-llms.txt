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

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUserOrThrow();
    const { id } = await ctx.params;
    const site = await assertOwnsSiteByUid(id, user.id);
    return Response.json({ site });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const user = await requireUserOrThrow();
    const { id } = await ctx.params;
    const site = await assertOwnsSiteByUid(id, user.id);
    const body = updateSiteSchema.parse(await req.json());

    const [updated] = await getDb()
      .update(sites)
      .set({ ...body, updatedAt: new Date().toISOString() })
      .where(eq(sites.id, site.id))
      .returning();

    return Response.json({ site: updated });
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
    const { id } = await ctx.params;
    const site = await assertOwnsSiteByUid(id, user.id);
    await getDb().delete(sites).where(eq(sites.id, site.id));
    return new Response(null, { status: 204 });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
