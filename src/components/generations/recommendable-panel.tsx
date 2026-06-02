'use client';
import { useEffect, useState } from 'react';
import { RefreshCw, Sparkles } from 'lucide-react';
import { TabPanel } from '@/components/layout/tab-panel';
import { formatRelativeTime } from '@/lib/format-time';
import { useGeoAudit, type SiteType, type Goal } from './use-geo-audit';
import { GeoConfirmCard } from './geo-confirm-card';
import { GeoScoreGauge } from './geo-score-gauge';
import { GeoSignalList } from './geo-signal-list';

const STAGE_LABEL: Record<string, string> = {
  crawling: 'Crawling your site',
  confirming: 'Confirming candidates with a model',
  scoring: 'Scoring signals',
};

export function RecommendablePanel({ siteId }: { siteId: string }) {
  const { audit, isLoading, classify, classifyState, run, runState } = useGeoAudit(siteId);
  const [editing, setEditing] = useState(false);
  const [suggested, setSuggested] = useState<{ siteType: SiteType; confidence: number } | null>(null);

  const status = audit?.status ?? null;
  const needsDiscovery = !isLoading && audit === null && suggested === null && !classifyState.isPending;

  useEffect(() => {
    if (!needsDiscovery) return;
    let cancelled = false;
    classify()
      .then((r) => { if (!cancelled) setSuggested({ siteType: r.suggestedType, confidence: r.confidence }); })
      .catch(() => { if (!cancelled) setSuggested({ siteType: 'other', confidence: 0 }); });
    return () => { cancelled = true; };
  }, [needsDiscovery, classify]);

  async function handleAnalyze(input: { siteType: SiteType; goal: Goal }) {
    setEditing(false);
    await run(input);
  }

  if (isLoading) {
    return <TabPanel flat><p className="py-8 text-center text-body">Loading…</p></TabPanel>;
  }

  if (status === 'pending' || status === 'running') {
    return (
      <TabPanel flat>
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-soft" aria-hidden="true" />
          <p className="text-ink">Analyzing — you can leave and come back</p>
          <p className="text-sm text-muted-soft">{STAGE_LABEL[audit?.stage ?? ''] ?? 'Starting…'}</p>
        </div>
      </TabPanel>
    );
  }

  const result = status === 'succeeded' ? audit?.results ?? null : null;

  if (!result || editing) {
    if (classifyState.isPending || (!suggested && !audit)) {
      return (
        <TabPanel flat>
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <Sparkles className="h-6 w-6 animate-pulse text-muted-soft" aria-hidden="true" />
            <p className="text-sm text-body">Reading your crawled pages…</p>
          </div>
        </TabPanel>
      );
    }
    const seedType = (audit?.siteType as SiteType) ?? suggested?.siteType ?? 'other';
    const seedConf = suggested?.confidence ?? 1;
    return (
      <TabPanel flat>
        <GeoConfirmCard
          suggestedType={seedType}
          confidence={seedConf}
          onAnalyze={handleAnalyze}
          isRunning={runState.isPending}
        />
        {runState.isError && <p className="pb-4 text-center text-sm text-destructive">Couldn&apos;t start the analysis. Try again.</p>}
      </TabPanel>
    );
  }

  return (
    <TabPanel
      flat
      meta={<GeoScoreGauge score={result.score} tier={result.tier} />}
      actions={
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-canvas px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-canvas-soft"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          Re-run / change type
        </button>
      }
    >
      <p className="mb-3 text-xs text-muted-soft">
        {audit?.fetchedAt ? `Last analyzed ${formatRelativeTime(audit.fetchedAt)} · ` : ''}
        {result.siteType} · goal: {result.goal}
      </p>
      <GeoSignalList signals={result.signals} />
      <p className="mt-4 text-xs text-muted-soft">
        Scanned {result.metadata.pagesScanned} pages, checked {result.metadata.confirmCalls} candidates with a model.
      </p>
    </TabPanel>
  );
}
