import { and, eq, desc } from 'drizzle-orm';
import { start } from 'workflow/api';
import { getDb } from '@/db';
import { generations, siteGeoAudits } from '@/db/schema';
import type { SiteGeoAudit } from '@/db/schema';
import type { Goal, SiteType } from './types';
import { runGeoAuditWorkflow } from '@/lib/workflow/geo-audit-workflow';

/** Create a pending audit row and start the workflow. */
export async function enqueueGeoAudit(opts: {
  siteId: number;
  siteType: SiteType;
  goal: Goal;
}): Promise<SiteGeoAudit> {
  const db = getDb();
  const [gen] = await db
    .select()
    .from(generations)
    .where(and(eq(generations.siteId, opts.siteId), eq(generations.status, 'succeeded')))
    .orderBy(desc(generations.createdAt))
    .limit(1);

  const [row] = await db
    .insert(siteGeoAudits)
    .values({
      siteId: opts.siteId,
      generationId: gen?.id ?? null,
      status: 'pending',
      trigger: 'manual',
      siteType: opts.siteType,
      goal: opts.goal,
    })
    .returning();

  const { runId } = await start(runGeoAuditWorkflow, [{ auditId: row.id }]);
  const [updated] = await db
    .update(siteGeoAudits)
    .set({ workflowRunId: runId })
    .where(eq(siteGeoAudits.id, row.id))
    .returning();
  return updated;
}
