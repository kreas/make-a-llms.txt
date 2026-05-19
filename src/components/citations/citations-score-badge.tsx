import { cn } from '@/lib/utils';
import { CitationsTierPill } from './citations-tier-pill';

type Tier = 'excellent' | 'good' | 'fair' | 'poor';

export function CitationsScoreBadge({
  score,
  tier,
  failingCount,
  totalCount,
}: {
  score: number;
  tier: Tier;
  failingCount: number;
  totalCount: number;
}) {
  return (
    <div className="flex items-center gap-4">
      <div
        className={cn(
          'flex flex-col items-center justify-center rounded-xl border border-hairline w-24 h-24 bg-surface-card',
        )}
      >
        <span className="display-md leading-none">{score}</span>
        <span className="text-xs text-body">/100</span>
      </div>
      <div className="flex flex-col gap-1">
        <CitationsTierPill tier={tier} />
        <span className="text-sm text-body">
          {failingCount} of {totalCount} checks failing
        </span>
      </div>
    </div>
  );
}
