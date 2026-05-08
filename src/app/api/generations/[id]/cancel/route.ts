import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { generations } from '@/db/schema';
import {
  apiErrorResponse,
  ApiError,
  assertOwnsGeneration,
  requireUserOrThrow,
} from '@/lib/auth-guards';
import { cancelRun } from '@/lib/workflow/wdk';

type Ctx = { params: Promise<{ id: string }> };

const TERMINAL = new Set(['succeeded', 'failed', 'cancelled']);

export async function POST(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUserOrThrow();
    const { id } = await ctx.params;
    const n = Number(id);
    if (!Number.isInteger(n) || n <= 0) {
      throw new ApiError(404, 'not_found', 'Generation not found');
    }
    const gen = await assertOwnsGeneration(n, user.id);

    if (TERMINAL.has(gen.status)) {
      return Response.json({ generation: gen });
    }

    if (gen.workflowRunId) {
      try {
        await cancelRun(gen.workflowRunId);
      } catch (err) {
        console.warn('[cancel] WDK cancelRun failed', err);
      }
    }

    const ts = new Date().toISOString();
    const [updated] = await getDb()
      .update(generations)
      .set({ status: 'cancelled', completedAt: ts, updatedAt: ts })
      .where(eq(generations.id, n))
      .returning();

    return Response.json({ generation: updated });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
