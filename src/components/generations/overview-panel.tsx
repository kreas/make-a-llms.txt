'use client';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { TabPanel } from '@/components/layout/tab-panel';
import {
  sitePillarScores,
  pickNextAction,
  stageStatus,
  type AuditLike,
} from '@/lib/citation-audit/site-readiness';
import type { Pillar } from '@/lib/citation-audit/pillars';
import type { Tier } from '@/lib/citation-audit/types';
import type { SiteGeoAuditResult } from '@/lib/geo-audit/types';

const CHECK_LABEL: Record<string, string> = {
  'h1-present': 'H1 present',
  'heading-hierarchy': 'Heading hierarchy clean',
  'meta-description': 'Meta description',
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
  'geo:pricing': 'Add a public pricing page',
  'geo:comparison': 'Add a competitor comparison page',
  'geo:case-study': 'Add a case study with a real metric',
};

const PILLAR_TAB: Record<Pillar, string> = {
  readable: 'readable',
  recommendable: 'recommendable',
  recognized: 'recognized',
};

function pillarScoreColor(score: number): string {
  if (score >= 70) return 'text-semantic-success';
  if (score >= 50) return 'text-primary-base';
  return 'text-destructive';
}

function PillarCard({
  title,
  subtitle,
  score,
  onClick,
}: {
  title: string;
  subtitle: string;
  score: { score: number; tier: Tier } | null;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-xl border border-hairline bg-surface-card p-5 flex flex-col gap-2 text-left w-full cursor-pointer hover:bg-canvas-soft transition-colors"
    >
      <p className="caption-uppercase text-muted-strong">{title}</p>
      <p className="text-xs text-muted-soft">{subtitle}</p>
      {score ? (
        <p className={`mt-auto text-2xl font-semibold ${pillarScoreColor(score.score)}`}>
          {score.score}
          <span className="ml-1 text-sm font-normal text-muted-soft capitalize">{score.tier}</span>
        </p>
      ) : (
        <p className="mt-auto text-sm text-muted-soft">— Run an audit</p>
      )}
    </button>
  );
}

export function OverviewPanel({
  siteId,
  onNavigate,
}: {
  siteId: string;
  onNavigate: (tab: string) => void;
}) {
  const latest = useQuery({
    queryKey: ['citation-audits', 'latest', siteId],
    queryFn: async (): Promise<{ audits: AuditLike[] }> => {
      const res = await fetch(`/api/sites/${siteId}/citation-audits/latest`);
      if (!res.ok) throw new Error('Failed to load readiness');
      return res.json();
    },
  });

  const geo = useQuery({
    queryKey: ['geo-audit', 'latest', siteId],
    queryFn: async (): Promise<{ audit: { status: string; results: SiteGeoAuditResult | null } | null }> => {
      const res = await fetch(`/api/sites/${siteId}/geo-audit/latest`);
      if (!res.ok) throw new Error('Failed to load GEO analysis');
      return res.json();
    },
  });

  if (latest.isPending || geo.isPending) {
    return (
      <TabPanel flat>
        <p className="text-center text-body py-8">Loading readiness…</p>
      </TabPanel>
    );
  }

  if (latest.isError) {
    return (
      <TabPanel flat>
        <p className="text-center text-body py-8">Could not load readiness data.</p>
      </TabPanel>
    );
  }

  const audits = latest.data?.audits ?? [];
  const geoResult =
    geo.data?.audit?.status === 'succeeded' ? (geo.data.audit.results ?? null) : null;
  const scores = sitePillarScores(audits, geoResult);
  const next = pickNextAction(audits, geoResult);
  const status = stageStatus(scores);

  return (
    <TabPanel flat>
      {/* Stage status */}
      <div className="mb-6">
        <p className="text-base text-body">{status}</p>
      </div>

      {/* Do this next / all caught up */}
      {next !== null ? (
        <div className="mb-6 rounded-xl border border-hairline bg-surface-card p-5">
          <p className="caption-uppercase text-muted-strong mb-2">▶ Do this next</p>
          <p className="font-semibold text-ink mb-1">{CHECK_LABEL[next.checkId] ?? next.checkId}</p>
          {next.recommendation && (
            <p className="text-sm text-body mb-3">{next.recommendation}</p>
          )}
          <p className="text-xs text-muted-soft mb-3">{next.pageUrl}</p>
          <button
            onClick={() => onNavigate(PILLAR_TAB[next.pillar])}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-hairline rounded-md bg-canvas hover:bg-canvas-soft transition-colors text-ink shadow-sm cursor-pointer"
          >
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            Show me how
          </button>
        </div>
      ) : audits.length > 0 ? (
        <div className="mb-6 rounded-xl border border-hairline bg-surface-card p-5">
          <p className="text-sm text-body">You&apos;re all caught up on the basics. Well done.</p>
        </div>
      ) : null}

      {/* Three pillar cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <PillarCard
          title="Readable"
          subtitle="Can AI read and quote your pages?"
          score={scores.readable}
          onClick={() => onNavigate('readable')}
        />
        <PillarCard
          title="Recommendable"
          subtitle="Will AI pick you when asked to choose?"
          score={scores.recommendable}
          onClick={() => onNavigate('recommendable')}
        />
        <PillarCard
          title="Recognized"
          subtitle="Does AI already know who you are?"
          score={scores.recognized}
          onClick={() => onNavigate('recognized')}
        />
      </div>
    </TabPanel>
  );
}
