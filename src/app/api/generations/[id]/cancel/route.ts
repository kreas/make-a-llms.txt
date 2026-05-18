import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { generations } from '@/db/schema';
import {
  apiErrorResponse,
  assertOwnsGenerationByUid,
  requireUserOrThrow,
} from '@/lib/auth-guards';
import { cancelRun } from '@/lib/workflow/wdk';

type Ctx = { params: Promise<{ id: string }> };

const TERMINAL = new Set(['succeeded', 'failed', 'cancelled']);

export async function POST(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUserOrThrow();
    const { id } = await ctx.params;
    const gen = await assertOwnsGenerationByUid(id, user.id);

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
      .where(eq(generations.id, gen.id))
      .returning();

    return Response.json({ generation: updated });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
