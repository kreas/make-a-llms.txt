'use client';
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { CitationsScoreCard } from './citations-score-card';
import { CitationsHistoryList } from './citations-history-list';
import { Check, X } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { formatRelativeTime } from '@/lib/format-time';
import { cn } from '@/lib/utils';

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
  pageTitle: string | null;
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

  // Auto-run the audit on first visit to a page that has no history yet.
  // Reset the guard whenever the user navigates to a different page.
  const autoRanFor = useRef<string | null>(null);
  useEffect(() => {
    if (autoRanFor.current === pageUrl) return;
    if (!history.isSuccess) return;
    if (runAudit.isPending) return;
    if (audits.length > 0) return;
    autoRanFor.current = pageUrl;
    runAudit.mutate();
  }, [pageUrl, history.isSuccess, audits.length, runAudit]);

  const noResultYet = !current;
  const isInitialLoading =
    noResultYet && (history.isLoading || runAudit.isPending) && !runAudit.isError;

  if (isInitialLoading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <button onClick={onBack} className="text-sm text-body hover:text-ink">← Back to list</button>
        </div>
        <div className="rounded-xl bg-canvas-soft py-16 flex flex-col items-center justify-center gap-4">
          <pre
            aria-hidden
            className="font-mono text-sm leading-tight text-ink animate-pulse"
          >{` /\\_/\\
( o.o )
 > ^ <`}</pre>
          <p className="text-sm text-body">Auditing this page…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="text-sm text-body hover:text-ink">← Back to list</button>
        <Button onClick={() => runAudit.mutate()} disabled={runAudit.isPending}>
          {runAudit.isPending ? 'Auditing… (~10s)' : 'Run new audit'}
        </Button>
      </div>

      <div className="flex flex-col gap-1">
        <h2 className="display-sm text-ink truncate">
          {current?.results?.pageTitle?.trim() || pageUrl}
        </h2>
        <a
          href={pageUrl}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-[13px] text-body hover:text-ink truncate"
          title={pageUrl}
        >
          {pageUrl}
        </a>
        {current && (
          <p className="text-body text-sm">Last audited {formatRelativeTime(current.fetchedAt)}</p>
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
          <CitationsScoreCard
            score={current.score}
            tier={current.tier}
            failingCount={current.results.checks.filter((c) => !c.passed).length}
            totalCount={current.results.checks.length}
            checks={current.results.checks}
          />
          <section>
            <h3 className="caption-uppercase text-xs text-body mb-2">Checks</h3>
            <Accordion
              type="multiple"
              defaultValue={current.results.checks.filter((c) => !c.passed).map((c) => c.id)}
              className="divide-y divide-hairline"
            >
              {[...current.results.checks]
                .sort((a, b) => Number(a.passed) - Number(b.passed))
                .map((c) => {
                  const Icon = c.passed ? Check : X;
                  const iconClass = c.passed ? 'text-semantic-success' : 'text-destructive';
                  return (
                    <AccordionItem key={c.id} value={c.id} className="border-b-0">
                      <AccordionTrigger className="hover:no-underline py-3">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <Icon className={cn('w-4 h-4 shrink-0', iconClass)} aria-hidden />
                          <span className="font-medium text-ink truncate">
                            {CHECK_LABEL[c.id] ?? c.id}
                          </span>
                          <span className="ml-auto text-xs text-body whitespace-nowrap pr-2">
                            weight {c.weight} • {c.score}/100
                          </span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="pb-3 pl-7">
                        {c.evidence.length > 0 && (
                          <p className="text-sm text-body">Found: {c.evidence.join(' ')}</p>
                        )}
                        {c.recommendation && (
                          <p className="text-sm text-ink mt-1">Fix: {c.recommendation}</p>
                        )}
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
            </Accordion>
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
