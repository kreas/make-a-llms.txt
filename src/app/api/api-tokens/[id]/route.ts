import { ZodError } from 'zod';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { apiTokens } from '@/db/schema';
import { ApiError, apiErrorResponse, requireUserOrThrow } from '@/lib/auth-guards';
import { parseUid } from '@/lib/uid';

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUserOrThrow();
    const { id } = await ctx.params;
    let uid: string;
    try {
      uid = parseUid(id);
    } catch (err) {
      if (err instanceof ZodError) throw new ApiError(400, 'validation', 'Token id must be a UUID');
      throw err;
    }
    const [row] = await getDb()
      .select()
      .from(apiTokens)
      .where(and(eq(apiTokens.uid, uid), eq(apiTokens.userId, user.id)));
    if (!row) throw new ApiError(404, 'not_found', 'Token not found');
    if (!row.revokedAt) {
      await getDb()
        .update(apiTokens)
        .set({ revokedAt: new Date().toISOString() })
        .where(eq(apiTokens.id, row.id));
    }
    return Response.json({ ok: true });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
