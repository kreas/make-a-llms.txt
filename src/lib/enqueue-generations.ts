import { and, eq, inArray } from 'drizzle-orm';
import { start } from 'workflow/api';
import { getDb } from '@/db';
import { generations, sites, type Generation } from '@/db/schema';
import { generateSiteFilesWorkflow } from '@/lib/workflow/generate-site-files';

export type EnqueueOpts = {
  trigger: 'manual' | 'webhook';
  notifyEmail?: boolean;
};

export async function enqueueGenerationsForSite(
  siteId: number,
  opts: EnqueueOpts,
): Promise<Generation> {
  const db = getDb();

  const [site] = await db.select().from(sites).where(eq(sites.id, siteId));
  if (!site) throw new Error(`site ${siteId} not found`);

  const inFlight = await db
    .select()
    .from(generations)
    .where(
      and(eq(generations.siteId, siteId), inArray(generations.status, ['pending', 'running'])),
    );
  if (inFlight.length > 0) return inFlight[0];

  const notifyEmail = opts.trigger === 'webhook' ? true : opts.notifyEmail ?? false;

  const [row] = await db
    .insert(generations)
    .values({
      siteId,
      userId: site.userId,
      status: 'pending',
      trigger: opts.trigger,
      notifyEmail,
    })
    .returning();

  const { runId } = await start(generateSiteFilesWorkflow, [{ generationId: row.id }]);

  const [updated] = await db
    .update(generations)
    .set({ workflowRunId: runId, updatedAt: new Date().toISOString() })
    .where(eq(generations.id, row.id))
    .returning();

  return updated;
}
