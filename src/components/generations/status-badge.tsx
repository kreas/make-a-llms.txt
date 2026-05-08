import { cn } from '@/lib/utils';

type Status = 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled';

const MAP: Record<Status, { label: string; cls: string; pill: boolean }> = {
  pending: { label: 'PENDING', cls: 'bg-surface-strong text-muted-strong', pill: true },
  running: { label: 'RUNNING', cls: 'bg-canvas-soft text-ink', pill: true },
  succeeded: { label: 'DONE', cls: 'bg-semantic-success text-canvas', pill: true },
  failed: { label: 'FAILED', cls: 'bg-destructive text-canvas', pill: true },
  cancelled: { label: 'Cancelled', cls: 'text-muted-soft italic', pill: false },
};

export function StatusBadge({ status }: { status: Status }) {
  const { label, cls, pill } = MAP[status];
  if (!pill) {
    return <span className={cn('caption-uppercase', cls)}>{label}</span>;
  }
  return (
    <span
      className={cn(
        'caption-uppercase inline-flex items-center rounded-pill px-2.5 py-1',
        cls,
      )}
    >
      {status === 'running' && (
        <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-ink" />
      )}
      {label}
    </span>
  );
}
