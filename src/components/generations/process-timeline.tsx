import { Search, BookOpen, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

type Status = 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export function ProcessTimeline({ status }: { status: Status }) {
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
      color: 'bg-timeline-done text-canvas',
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
              'caption-uppercase inline-flex items-center gap-1 rounded-full border border-hairline px-2 py-1 text-ink',
              s.reached ? s.color : 'bg-surface-strong text-muted-soft',
            )}
          >
            <s.icon className="h-3 w-3" />
            {s.label}
          </span>
        </span>
      ))}
    </div>
  );
}
