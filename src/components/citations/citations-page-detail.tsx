'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { CitationsScoreBadge } from './citations-score-badge';
import { CitationsCheckRow } from './citations-check-row';
import { CitationsHistoryList } from './citations-history-list';
import { formatRelativeTime } from '@/lib/format-time';

const CHECK_LABEL: Record<string, string> = {
  'h1-present': 'H1 present',
  'heading-hierarchy': 'Heading hierarchy clean',
  'meta-description': 'Meta description (120-160 chars)',
  'canonical': 'Canonical tag',
  'schema-type': 'Schema.org type',
  'schema-fields': 'Required schema fields',
  'answer-position': 'Answer in first 100 words',
  'entity-first-paragraph': 'Entity in first paragraph',
  'question-h2s': 'Question-style H2s',
  'lists-tables': 'Lists or tables present',
  'definitions': 'Definition pattern in opening',
  'freshness': 'Recently updated',
  'readability': 'Reading level grade 8-10',
  'named-entities': 'Named entities disambiguated',
  'internal-links': 'Internal links to related pages',
};

type AuditResults = {
  score: number;
  tier: 'poor' | 'fair' | 'good' | 'excellent';
  checks: { id: string; passed: boolean; score: number; weight: number; evidence: string[]; recommendation: string | null }[];
};

type Audit = {
  id: string;
  pageUrl: string;
  status: 'succeeded' | 'failed';
  score: number | null;
  tier: 'poor' | 'fair' | 'good' | 'excellent' | null;
  fetchedAt: string;
  errorReason: string | null;
  errorMessage: string | null;
  results: AuditResults | null;
};

export function CitationsPageDetail({ siteUid, pageUrl, onBack }: { siteUid: string; pageUrl: string; onBack: () => void }) {
  const qc = useQueryClient();
  const [viewingId, setViewingId] = useState<string | null>(null);

  const history = useQuery({
    queryKey: ['citation-audits', 'history', siteUid, pageUrl],
    queryFn: async (): Promise<{ audits: Audit[] }> => {
      const res = await fetch(`/api/sites/${siteUid}/citation-audits?pageUrl=${encodeURIComponent(pageUrl)}&limit=10`);
      if (!res.ok) throw new Error('Failed to load history');
      return res.json();
    },
  });

  const audits = history.data?.audits ?? [];
  const current = audits.find((a) => a.id === viewingId) ?? audits[0];

  const runAudit = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/sites/${siteUid}/citation-audits`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageUrl }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? 'Audit failed');
      return body.audit as Audit;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['citation-audits', 'history', siteUid, pageUrl] });
      qc.invalidateQueries({ queryKey: ['citation-audits', 'latest', siteUid] });
      setViewingId(null);
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="text-sm text-body hover:text-ink">← Back to list</button>
        <Button onClick={() => runAudit.mutate()} disabled={runAudit.isPending}>
          {runAudit.isPending ? 'Auditing… (~10s)' : 'Run new audit'}
        </Button>
      </div>

      <div>
        <h2 className="display-sm">{pageUrl}</h2>
        {current && (
          <p className="text-body text-sm">
            Last audited {formatRelativeTime(current.fetchedAt)} • Audit #{current.id}
          </p>
        )}
      </div>

      {runAudit.isError && (
        <div className="border border-hairline rounded-lg p-3 bg-destructive/10 text-destructive text-sm">
          Audit failed: {(runAudit.error as Error).message}
        </div>
      )}

      {current?.status === 'failed' && (
        <div className="border border-hairline rounded-lg p-3 bg-destructive/10 text-destructive text-sm">
          Audit failed ({current.errorReason}): {current.errorMessage}
        </div>
      )}

      {current?.status === 'succeeded' && current.results && current.score !== null && current.tier && (
        <>
          <CitationsScoreBadge
            score={current.score}
            tier={current.tier}
            failingCount={current.results.checks.filter((c) => !c.passed).length}
            totalCount={current.results.checks.length}
          />
          <section>
            <h3 className="caption-uppercase text-xs text-body mb-2">Checks</h3>
            <ul className="flex flex-col gap-2">
              {[...current.results.checks].sort((a, b) => Number(a.passed) - Number(b.passed)).map((c) => (
                <CitationsCheckRow key={c.id} check={c} label={CHECK_LABEL[c.id] ?? c.id} />
              ))}
            </ul>
          </section>
        </>
      )}

      {audits.length > 1 && (
        <section>
          <h3 className="caption-uppercase text-xs text-body mb-2">Previous audits</h3>
          <CitationsHistoryList
            items={audits.map((a) => ({ id: a.id, score: a.score, tier: a.tier, fetchedAt: a.fetchedAt, status: a.status }))}
            currentId={current?.id ?? ''}
            onSelect={(id) => setViewingId(id)}
          />
        </section>
      )}
    </div>
  );
}
