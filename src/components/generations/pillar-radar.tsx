'use client';
import { PolarAngleAxis, PolarGrid, Radar, RadarChart } from 'recharts';
import { ChartContainer, type ChartConfig } from '@/components/ui/chart';

export function PillarRadar({
  readable,
  recommendable,
  recognized,
}: {
  readable: number;
  recommendable: number;
  recognized: number;
}) {
  const data = [
    { pillar: 'Readable', value: readable },
    { pillar: 'Recommendable', value: recommendable },
    { pillar: 'Recognized', value: recognized },
  ];
  const config = { value: { label: 'Score', color: 'var(--color-primary)' } } satisfies ChartConfig;

  return (
    <div>
      <ChartContainer config={config} className="mx-auto aspect-square w-full max-w-[220px]">
        <RadarChart data={data}>
          <PolarGrid />
          <PolarAngleAxis dataKey="pillar" />
          <Radar dataKey="value" fill="var(--color-primary)" fillOpacity={0.2} stroke="var(--color-primary)" />
        </RadarChart>
      </ChartContainer>
      <ul className="sr-only">
        {data.map((d) => (
          <li key={d.pillar}>{d.pillar} {d.value}</li>
        ))}
      </ul>
    </div>
  );
}
