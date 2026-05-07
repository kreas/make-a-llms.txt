import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { sites } from '@/db/schema';
import {
  apiErrorResponse,
  ApiError,
  assertOwnsSite,
  requireUserOrThrow,
} from '@/lib/auth-guards';
import { updateSiteSchema } from '@/lib/validators';

type Ctx = { params: Promise<{ id: string }> };

async function parseSiteId(ctx: Ctx): Promise<number> {
  const { id } = await ctx.params;
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) throw new ApiError(404, 'not_found', 'Site not found');
  return n;
}

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUserOrThrow();
    const id = await parseSiteId(ctx);
    const site = await assertOwnsSite(id, user.id);
    return Response.json({ site });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const user = await requireUserOrThrow();
    const id = await parseSiteId(ctx);
    await assertOwnsSite(id, user.id);
    const body = updateSiteSchema.parse(await req.json());

    const [updated] = await getDb()
      .update(sites)
      .set({ ...body, updatedAt: new Date().toISOString() })
      .where(eq(sites.id, id))
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
    const id = await parseSiteId(ctx);
    await assertOwnsSite(id, user.id);
    await getDb().delete(sites).where(eq(sites.id, id));
    return new Response(null, { status: 204 });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
