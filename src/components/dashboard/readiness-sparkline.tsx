const W = 96;
const H = 32;

export function ReadinessSparkline({ data }: { data: number[] | null }) {
  if (!data || data.length < 2) {
    return <span className="text-[11px] text-muted-soft">Not enough history yet</span>;
  }
  const min = Math.min(...data);
  const max = Math.max(...data);
  // A flat series carries no trend; center it so a stable-high score doesn't read as zero.
  const flat = max === min;
  const span = max - min || 1;
  const step = W / (data.length - 1);
  const points = data
    .map((v, i) => {
      const y = flat ? H / 2 : H - ((v - min) / span) * H;
      return `${(i * step).toFixed(1)},${y.toFixed(1)}`;
    })
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
