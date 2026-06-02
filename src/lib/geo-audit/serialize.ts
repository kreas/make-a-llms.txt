import type { SiteGeoAudit } from '@/db/schema';
import type { SiteGeoAuditResult } from './types';

export function serializeSiteGeoAudit(a: SiteGeoAudit, siteUid: string) {
  return {
    id: a.uid,
    siteId: siteUid,
    status: a.status,
    score: a.score,
    tier: a.tier,
    fetchedAt: a.fetchedAt,
    llmMsUsed: a.llmMsUsed,
    errorReason: a.errorReason,
    errorMessage: a.errorMessage,
    results: a.results ? (JSON.parse(a.results) as SiteGeoAuditResult) : null,
  };
}

export type SerializedSiteGeoAudit = ReturnType<typeof serializeSiteGeoAudit>;
