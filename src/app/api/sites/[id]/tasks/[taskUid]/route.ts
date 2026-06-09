import { ZodError } from 'zod';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { siteTasks } from '@/db/schema';
import { ApiError, apiErrorResponse, assertOwnsSiteByUid, requireUserOrThrow } from '@/lib/auth-guards';
import { parseUid } from '@/lib/uid';
import { patchSiteTaskBodySchema } from '@/lib/validators/site-tasks';
import { serializeSiteTask } from '@/lib/tasks/serialize';

type Ctx = { params: Promise<{ id: string; taskUid: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const user = await requireUserOrThrow();
    const { id, taskUid } = await ctx.params;

    let siteUid: string;
    try {
      siteUid = parseUid(id);
    } catch (e) {
      if (e instanceof ZodError) throw new ApiError(400, 'validation', 'Site id must be a UUID');
      throw e;
    }

    let parsedTaskUid: string;
    try {
      parsedTaskUid = parseUid(taskUid);
    } catch (e) {
      if (e instanceof ZodError) throw new ApiError(400, 'validation', 'Task id must be a UUID');
      throw e;
    }

    const site = await assertOwnsSiteByUid(siteUid, user.id);
    const body = patchSiteTaskBodySchema.safeParse(await req.json().catch(() => null));
    if (!body.success) throw new ApiError(400, 'validation', body.error.message);

    const db = getDb();
    const [updated] = await db
      .update(siteTasks)
      .set({ status: body.data.status, statusChangedAt: new Date().toISOString() })
      .where(and(eq(siteTasks.uid, parsedTaskUid), eq(siteTasks.siteId, site.id)))
      .returning();
    if (!updated) throw new ApiError(404, 'not_found', 'Task not found');
    return Response.json({ task: serializeSiteTask(updated) });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
