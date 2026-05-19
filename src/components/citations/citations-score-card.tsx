'use client';

import { RadialBar, RadialBarChart, PolarAngleAxis } from 'recharts';
import { ChartContainer, type ChartConfig } from '@/components/ui/chart';
import { CitationsTierPill } from './citations-tier-pill';

type Tier = 'excellent' | 'good' | 'fair' | 'poor';

export type ScoreCardCheck = {
  id: string;
  score: number;
  weight: number;
  passed: boolean;
};

type Props = {
  score: number;
  tier: Tier;
  failingCount: number;
  totalCount: number;
  checks: ScoreCardCheck[];
};

type Category = { key: string; label: string; checkIds: string[] };

const CATEGORIES: readonly Category[] = [
  {
    key: 'structure',
    label: 'Structure',
    checkIds: ['h1-present', 'heading-hierarchy', 'lists-tables', 'question-h2s'],
  },
  {
    key: 'answer-quality',
    label: 'Answer quality',
    checkIds: ['answer-position', 'entity-first-paragraph', 'definitions', 'readability'],
  },
  {
    key: 'metadata-schema',
    label: 'Metadata & schema',
    checkIds: ['meta-description', 'canonical', 'schema-type', 'schema-fields'],
  },
  {
    key: 'authority-freshness',
    label: 'Authority & freshness',
    checkIds: ['named-entities', 'internal-links', 'freshness'],
  },
] as const;

const TIER_FILL: Record<Tier, string> = {
  poor: 'var(--color-destructive)',
  fair: 'var(--color-timeline-thinking)',
  good: 'var(--color-timeline-done)',
  excellent: 'var(--color-semantic-success)',
};

function aggregateCategory(checks: ScoreCardCheck[], ids: string[]) {
  const inCat = checks.filter((c) => ids.includes(c.id));
  const totalWeight = inCat.reduce((a, c) => a + c.weight, 0);
  if (totalWeight === 0) return { score: 0, totalWeight: 0 };
  const weightedSum = inCat.reduce((a, c) => a + c.score * c.weight, 0);
  return { score: Math.round(weightedSum / totalWeight), totalWeight };
}

export function CitationsScoreCard({ score, tier, failingCount, totalCount, checks }: Props) {
  const chartConfig = { score: { label: 'Score', color: TIER_FILL[tier] } } satisfies ChartConfig;
  const radialData = [{ name: 'score', value: score, fill: TIER_FILL[tier] }];

  const categoryRows = CATEGORIES.map((cat) => ({
    ...cat,
    ...aggregateCategory(checks, cat.checkIds),
  }));

  return (
    <section className="rounded-xl border border-hairline bg-surface-card p-6">
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:gap-8">
        <div className="flex items-center gap-5 md:flex-col md:items-start md:gap-3 md:basis-[220px]">
          <div className="relative aspect-square w-32 shrink-0">
            <ChartContainer config={chartConfig} className="h-full w-full">
              <RadialBarChart
                data={radialData}
                innerRadius="76%"
                outerRadius="100%"
                startAngle={90}
                endAngle={-270}
              >
                <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                <RadialBar
                  dataKey="value"
                  background={{ fill: 'var(--color-canvas-soft)' }}
                  cornerRadius={999}
                />
              </RadialBarChart>
            </ChartContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="display-md leading-none text-ink">{score}</span>
              <span className="text-xs text-body">/100</span>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <CitationsTierPill tier={tier} />
            <span className="text-sm text-body">
              {failingCount} of {totalCount} checks failing
            </span>
          </div>
        </div>

        <ul className="flex flex-1 flex-col gap-3">
          {categoryRows.map((c) => (
            <li key={c.key} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1">
              <span className="text-sm text-ink">{c.label}</span>
              <span className="font-mono text-xs text-body tabular-nums">
                {c.score} <span className="text-muted-soft">/ 100</span>
              </span>
              <div
                className="col-span-2 h-1.5 overflow-hidden rounded-full bg-canvas-soft"
                role="progressbar"
                aria-valuenow={c.score}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={c.label}
              >
                <div
                  className="h-full rounded-full transition-[width] duration-500"
                  style={{ width: `${c.score}%`, backgroundColor: TIER_FILL[tier] }}
                />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
