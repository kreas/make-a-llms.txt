import { processGeoAudit } from '@/lib/geo-audit/process';

export type GeoAuditPayload = { auditId: number };

/**
 * Entire body runs as a workflow. The single step does the durable
 * crawl → confirm → score → persist (it updates the audit row's status/stage
 * as it advances, so a client polling GET latest sees progress).
 */
export async function runGeoAuditWorkflow({ auditId }: GeoAuditPayload): Promise<{ ok: boolean }> {
  'use workflow';
  await geoAuditStep(auditId);
  return { ok: true };
}

async function geoAuditStep(auditId: number): Promise<void> {
  'use step';
  await processGeoAudit(auditId);
}
