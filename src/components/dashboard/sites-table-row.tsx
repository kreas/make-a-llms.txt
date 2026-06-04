import Link from 'next/link';
import type { DashboardSiteRow } from '@/lib/services/dashboard';
import type { PillarScore } from '@/lib/citation-audit/site-readiness';
import { formatRelativeTime } from '@/lib/format-time';

// Score bands for the data-viz bars/ring. Green/red are DESIGN semantic tokens;
// the mid blue/gold are local to this score visualization (the approved dashboard look).
function bandColor(score: number): string {
  if (score >= 70) return 'var(--color-semantic-success)';
  if (score >= 50) return '#3a6ea5';
  if (score >= 30) return '#d9a200';
  return 'var(--color-destructive)';
}

function PillarCell({ score }: { score: PillarScore | null }) {
  if (!score) {
    return (
      <td className="px-3 py-3.5">
        <span className="text-sm text-muted-soft">—</span>
      </td>
    );
  }
  return (
    <td className="px-3 py-3.5">
      <div className="flex min-w-[120px] items-center gap-2.5">
        <div className="h-[5px] flex-1 overflow-hidden rounded-sm bg-hairline">
          <div className="h-full rounded-sm" style={{ width: `${score.score}%`, background: bandColor(score.score) }} />
        </div>
        <span className="w-6 text-right text-[13px] tabular-nums text-body">{score.score}</span>
      </div>
    </td>
  );
}

export function SitesTableRow({ row }: { row: DashboardSiteRow }) {
  const { site, scores, composite, issues, nextAction, lastAuditedAt } = row;
  // Nothing scored yet (no citation OR GEO audit) → prompt to run one. Otherwise show issues.
  const unscored = composite === null;
  const host = site.rootUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
  return (
    <tr className="border-b border-hairline">
      <td className="px-3 py-3.5">
        <Link href={`/sites/${site.uid}`} className="flex items-center gap-3 hover:opacity-80">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-strong text-[13px] font-bold text-ink">
            {host.charAt(0).toUpperCase()}
          </span>
          <span className="flex flex-col">
            <span className="text-sm font-medium text-ink">{site.displayName ?? site.name}</span>
            <span className="font-mono text-[11.5px] text-muted-strong">
              {host}{lastAuditedAt ? ` · ${formatRelativeTime(lastAuditedAt)}` : ''}
            </span>
          </span>
        </Link>
      </td>
      <td className="px-3 py-3.5">
        {composite !== null ? (
          <span
            className="flex h-[42px] w-[42px] items-center justify-center rounded-full border-[3px] text-[13px] font-semibold text-ink"
            style={{ borderColor: bandColor(composite) }}
          >
            {composite}
          </span>
        ) : (
          <span className="text-sm text-muted-soft">—</span>
        )}
      </td>
      <PillarCell score={scores.readable} />
      <PillarCell score={scores.recommendable} />
      <PillarCell score={scores.recognized} />
      <td className="px-3 py-3.5 text-right">
        {unscored ? (
          <Link
            href={`/sites/${site.uid}`}
            className="inline-flex items-center rounded-full border border-hairline-strong bg-surface-card px-3 py-1.5 text-xs font-medium text-ink hover:bg-canvas-soft"
          >
            Run audit
          </Link>
        ) : issues > 0 ? (
          <span className="inline-flex flex-col items-end gap-0.5">
            <span className="rounded-full bg-[#fdeede] px-2.5 py-1 text-xs font-medium text-[#b86a14]">
              {issues} issue{issues === 1 ? '' : 's'}
            </span>
            {nextAction?.recommendation && (
              <span className="max-w-[180px] truncate text-[11px] text-muted-strong">{nextAction.recommendation}</span>
            )}
          </span>
        ) : (
          <span className="rounded-full bg-[#e6f3ee] px-2.5 py-1 text-xs font-medium text-semantic-success">
            ✓ caught up
          </span>
        )}
      </td>
    </tr>
  );
}
