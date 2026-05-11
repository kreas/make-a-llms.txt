import Link from 'next/link';
import type { Site, Generation } from '@/db/schema';
import { StatusBadge } from '@/components/generations/status-badge';
import { formatRelativeTime } from '@/lib/format-time';

type Props = {
  site: Site;
  latest: Generation | null;
};

export function SiteCard({ site, latest }: Props) {
  const status = latest?.status ?? 'pending';
  const isInFlight = status === 'pending' || status === 'running';
  const isFailed = status === 'failed' || status === 'cancelled';
  return (
    <div className="flex flex-col gap-6 rounded-lg border border-hairline bg-surface-card p-6 transition-colors hover:border-hairline-strong">
      <div className="flex items-start justify-between">
        <StatusBadge status={status} />
        <span className="font-mono text-[13px] text-muted-strong">
          {latest ? formatRelativeTime(latest.createdAt) : 'Not yet run'}
        </span>
      </div>
      <div>
        <h3 className="text-lg font-semibold text-ink">{site.name}</h3>
        <p className="mt-1 truncate font-mono text-[13px] text-muted-strong">{site.rootUrl}</p>
      </div>
      <div className="mt-auto flex gap-3 pt-3">
        <Link
          href={`/sites/${site.id}`}
          className="flex h-10 flex-1 items-center justify-center rounded-md border border-hairline-strong bg-surface-card text-sm font-medium text-ink transition-colors hover:bg-canvas-soft"
        >
          View
        </Link>
        <RegenerateLink
          siteId={site.id}
          disabled={isInFlight}
          label={isFailed ? 'Retry' : 'Run Now'}
        />
      </div>
    </div>
  );
}

function RegenerateLink({
  siteId,
  disabled,
  label,
}: {
  siteId: number;
  disabled: boolean;
  label: string;
}) {
  if (disabled) {
    return (
      <button
        type="button"
        disabled
        className="flex h-10 flex-1 cursor-not-allowed items-center justify-center rounded-md bg-surface-strong text-sm font-medium text-muted-strong"
      >
        {label}
      </button>
    );
  }
  return (
    <Link
      href={`/sites/${siteId}?action=regenerate`}
      className="flex h-10 flex-1 items-center justify-center rounded-md bg-primary text-sm font-medium text-canvas transition-colors hover:bg-primary-active"
    >
      {label}
    </Link>
  );
}
