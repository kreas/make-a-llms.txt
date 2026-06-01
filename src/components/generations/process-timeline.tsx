import { Search, BookOpen, Check, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

type Status = 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export function ProcessTimeline({
  status,
  onRegenerate,
  isRegenerating = false,
}: {
  status: Status;
  onRegenerate?: () => void;
  isRegenerating?: boolean;
}) {
  const stages = [
    {
      key: 'setup',
      label: 'Setup',
      icon: Search,
      color: 'bg-timeline-grep',
      reached: true,
    },
    {
      key: 'read',
      label: 'Read',
      icon: BookOpen,
      color: 'bg-timeline-read',
      reached: status === 'running' || status === 'succeeded',
    },
    {
      key: 'done',
      label: 'Done',
      icon: Check,
      color: 'bg-timeline-done text-on-primary',
      reached: status === 'succeeded',
    },
  ];
  return (
    <div className="flex items-center gap-2">
      <span className="caption-uppercase mr-1 text-muted-strong">Process:</span>
      {stages.map((s, i) => (
        <span key={s.key} className="flex items-center">
          {i > 0 && <span className="mx-1 h-px w-3 bg-hairline-strong" />}
          <span
            className={cn(
              'caption-uppercase inline-flex items-center gap-1 rounded-full border border-hairline px-2.5 py-1 text-ink',
              s.reached ? s.color : 'bg-surface-strong text-muted-soft',
            )}
          >
            <s.icon className="h-3 w-3" />
            {s.label}
          </span>
          {s.key === 'done' && s.reached && onRegenerate && (
            <button
              type="button"
              onClick={onRegenerate}
              disabled={isRegenerating}
              title="Re-run Generation"
              className="ml-4 inline-flex items-center justify-center text-muted-strong hover:text-ink disabled:opacity-50 transition-colors cursor-pointer"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isRegenerating && "animate-spin")} />
              <span className="sr-only">Re-run Generation</span>
            </button>
          )}
        </span>
      ))}
    </div>
  );
}
