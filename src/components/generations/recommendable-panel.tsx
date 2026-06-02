'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, X, RefreshCw, Sparkles } from 'lucide-react';
import { TabPanel } from '@/components/layout/tab-panel';
import { formatRelativeTime } from '@/lib/format-time';
import type { SerializedSiteGeoAudit } from '@/lib/geo-audit/serialize';

const SIGNAL_LABEL: Record<string, string> = {
  pricing: 'Public pricing page',
  comparison: 'Competitor comparison',
  'case-study': 'Case study with a metric',
};

function scoreColor(score: number): string {
  if (score >= 70) return 'text-semantic-success';
  if (score >= 50) return 'text-primary-base';
  return 'text-destructive';
}

export function RecommendablePanel({ siteId }: { siteId: string }) {
  const queryClient = useQueryClient();

  const latest = useQuery({
    queryKey: ['geo-audit', 'latest', siteId],
    queryFn: async (): Promise<{ audit: SerializedSiteGeoAudit | null }> => {
      const res = await fetch(`/api/sites/${siteId}/geo-audit/latest`);
      if (!res.ok) throw new Error('Failed to load GEO analysis');
      return res.json();
    },
  });

  const run = useMutation({
    mutationFn: async (): Promise<SerializedSiteGeoAudit> => {
      const res = await fetch(`/api/sites/${siteId}/geo-audit`, { method: 'POST' });
      if (!res.ok) throw new Error('GEO analysis failed');
      const body = (await res.json()) as { audit: SerializedSiteGeoAudit };
      return body.audit;
    },
    onSuccess: (audit) => {
      queryClient.setQueryData(['geo-audit', 'latest', siteId], { audit });
    },
  });

  if (latest.isPending) {
    return (
      <TabPanel flat>
        <p className="text-center text-body py-8">Loading…</p>
      </TabPanel>
    );
  }

  const audit = latest.data?.audit ?? null;
  const result = audit?.status === 'succeeded' ? audit.results : null;
  const running = run.isPending;

  // Empty / not-yet-run state
  if (!result) {
    return (
      <TabPanel flat>
        <div className="flex flex-col items-center text-center gap-4 py-12">
          <Sparkles className="h-8 w-8 text-muted-soft" aria-hidden="true" />
          <div>
            <p className="text-lg text-ink mb-1">See if AI has the evidence to recommend you</p>
            <p className="text-sm text-body max-w-md">
              We scan your crawled pages for public pricing, competitor comparisons, and case
              studies with real numbers — the proof AI needs to put you on a shortlist.
            </p>
          </div>
          <button
            onClick={() => run.mutate()}
            disabled={running}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-60 cursor-pointer"
          >
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {running ? 'Analyzing… ~15s' : 'Run GEO analysis'}
          </button>
          {run.isError && <p className="text-sm text-destructive">Analysis failed. Try again.</p>}
          {audit?.status === 'failed' && (
            <p className="text-sm text-muted-soft">{audit.errorMessage}</p>
          )}
        </div>
      </TabPanel>
    );
  }

  return (
    <TabPanel
      flat
      meta={
        <div>
          <p className={`text-2xl font-semibold ${scoreColor(result.score)}`}>
            {result.score}
            <span className="ml-1 text-sm font-normal text-muted-soft capitalize">{result.tier}</span>
          </p>
          <p className="text-xs text-muted-soft mt-0.5">
            Last analyzed {formatRelativeTime(audit!.fetchedAt)}
          </p>
        </div>
      }
      actions={
        <button
          onClick={() => run.mutate()}
          disabled={running}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-hairline rounded-md bg-canvas hover:bg-canvas-soft transition-colors text-ink disabled:opacity-60 cursor-pointer"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${running ? 'animate-spin' : ''}`} aria-hidden="true" />
          {running ? 'Analyzing…' : 'Re-run analysis'}
        </button>
      }
    >
      <ul className="divide-y divide-hairline">
        {result.signals.map((s) => (
          <li key={s.signal} className="flex gap-3 py-4">
            <span
              className={`flex-shrink-0 mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full ${
                s.present ? 'bg-semantic-success/10 text-semantic-success' : 'bg-canvas-soft text-muted-soft'
              }`}
            >
              {s.present ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-medium text-ink">{SIGNAL_LABEL[s.signal] ?? s.signal}</p>
                <span className="text-xs text-muted-soft">{s.weight} pts</span>
              </div>
              {s.present && s.artifacts.length > 0 && (
                <p className="mt-1 text-sm text-body">{s.artifacts.join(' · ')}</p>
              )}
              {s.present && s.pages.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                  {s.pages.map((url) => (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-muted-strong underline decoration-hairline-strong underline-offset-2 hover:text-ink"
                    >
                      {(() => {
                        try {
                          return new URL(url).pathname;
                        } catch {
                          return url;
                        }
                      })()}
                    </a>
                  ))}
                </div>
              )}
              {!s.present && s.recommendation && (
                <p className="mt-1 text-sm text-body border-l-2 border-hairline-strong pl-3">
                  {s.recommendation}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-muted-soft">
        Scanned {result.metadata.pagesScanned} pages, confirmed {result.metadata.confirmCalls} candidates with a model.
      </p>
    </TabPanel>
  );
}
