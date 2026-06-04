const W = 96;
const H = 32;

export function ReadinessSparkline({ data }: { data: number[] | null }) {
  if (!data || data.length < 2) {
    return <span className="text-[11px] text-muted-soft">Not enough history yet</span>;
  }
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const step = W / (data.length - 1);
  const points = data
    .map((v, i) => `${(i * step).toFixed(1)},${(H - ((v - min) / span) * H).toFixed(1)}`)
    .join(' ');
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden className="overflow-visible">
      <polyline
        points={points}
        fill="none"
        stroke="var(--color-semantic-success)"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
