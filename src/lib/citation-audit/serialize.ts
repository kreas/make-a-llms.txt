import type { CitationAudit } from '@/db/schema';

export function serializeCitationAudit(a: CitationAudit, siteUid: string) {
  return {
    id: a.uid,
    siteId: siteUid,
    pageUrl: a.pageUrl,
    status: a.status,
    score: a.score,
    tier: a.tier,
    fetchedAt: a.fetchedAt,
    fetchMs: a.fetchMs,
    browserMsUsed: a.browserMsUsed,
    trigger: a.trigger,
    errorReason: a.errorReason,
    errorMessage: a.errorMessage,
    results: a.results ? JSON.parse(a.results) : null,
  };
}

export type SerializedCitationAudit = ReturnType<typeof serializeCitationAudit>;
