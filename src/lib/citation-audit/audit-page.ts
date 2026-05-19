import type { AuditInput, AuditResult } from './types';
import { parsePage } from './parse';
import { CHECKS } from './checks';
import { aggregate } from './score';

export async function auditPage(input: AuditInput): Promise<AuditResult> {
  const t0 = Date.now();
  const parsed = parsePage(input.url, input.html);
  const ctx = { entityName: input.entityName };
  const checks = CHECKS.map((mod) => mod.check(parsed, ctx));
  const { score, tier } = aggregate(checks);
  return {
    score,
    tier,
    pageTitle: parsed.title,
    checks,
    metadata: { parseMs: Date.now() - t0 },
  };
}
