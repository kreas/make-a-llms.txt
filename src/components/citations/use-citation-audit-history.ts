'use client';
import { useQuery } from '@tanstack/react-query';

export type CitationAuditResults = {
  score: number;
  tier: 'poor' | 'fair' | 'good' | 'excellent';
  pageTitle: string | null;
  checks: {
    id: string;
    passed: boolean;
    score: number;
    weight: number;
    evidence: string[];
    recommendation: string | null;
  }[];
};

export type CitationAudit = {
  id: string;
  pageUrl: string;
  status: 'succeeded' | 'failed';
  score: number | null;
  tier: 'poor' | 'fair' | 'good' | 'excellent' | null;
  fetchedAt: string;
  errorReason: string | null;
  errorMessage: string | null;
  results: CitationAuditResults | null;
};

/** Audit history (most-recent-first) for a single page. Shared by the audit detail
 *  view and the export menu so both read from one cached request. */
export function useCitationAuditHistory(siteUid: string, pageUrl: string | null, enabled = true) {
  return useQuery({
    queryKey: ['citation-audits', 'history', siteUid, pageUrl],
    enabled: enabled && !!pageUrl,
    queryFn: async (): Promise<{ audits: CitationAudit[] }> => {
      const res = await fetch(
        `/api/sites/${siteUid}/citation-audits?pageUrl=${encodeURIComponent(pageUrl!)}&limit=10`,
      );
      if (!res.ok) throw new Error('Failed to load history');
      return res.json();
    },
  });
}
