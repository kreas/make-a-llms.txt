'use client';
import { RadialBar, RadialBarChart, PolarAngleAxis } from 'recharts';
import { ChartContainer, type ChartConfig } from '@/components/ui/chart';

type Tier = 'excellent' | 'good' | 'fair' | 'poor';

const TIER_FILL: Record<Tier, string> = {
  poor: 'var(--color-destructive)',
  fair: 'var(--color-body)',
  good: 'var(--color-semantic-success)',
  excellent: 'var(--color-semantic-success)',
};

export function GeoScoreGauge({ score, tier }: { score: number; tier: Tier }) {
  const config = { score: { label: 'Score', color: TIER_FILL[tier] } } satisfies ChartConfig;
  const data = [{ name: 'score', value: score, fill: TIER_FILL[tier] }];
  return (
    <div className="relative aspect-square w-32 shrink-0">
      <ChartContainer config={config} className="h-full w-full">
        <RadialBarChart data={data} innerRadius="76%" outerRadius="100%" startAngle={90} endAngle={-270}>
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          <RadialBar dataKey="value" background={{ fill: 'var(--color-surface-card)' }} cornerRadius={999} />
        </RadialBarChart>
      </ChartContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="display-md leading-none text-ink">{score}</span>
        <span className="text-xs capitalize text-body">{tier}</span>
      </div>
    </div>
  );
}
