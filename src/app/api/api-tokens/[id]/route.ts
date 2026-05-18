import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { apiTokens } from '@/db/schema';
import { ApiError, apiErrorResponse, requireUserOrThrow } from '@/lib/auth-guards';

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUserOrThrow();
    const { id } = await ctx.params;
    const n = Number(id);
    if (!Number.isInteger(n) || n <= 0) {
      throw new ApiError(404, 'not_found', 'Token not found');
    }
    const [row] = await getDb()
      .select()
      .from(apiTokens)
      .where(and(eq(apiTokens.id, n), eq(apiTokens.userId, user.id)));
    if (!row) throw new ApiError(404, 'not_found', 'Token not found');
    if (!row.revokedAt) {
      await getDb()
        .update(apiTokens)
        .set({ revokedAt: new Date().toISOString() })
        .where(eq(apiTokens.id, n));
    }
    return Response.json({ ok: true });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
