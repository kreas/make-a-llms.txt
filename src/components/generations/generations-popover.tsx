'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Generation } from '@/db/schema';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { StatusBadge } from './status-badge';
import { formatRelativeTime } from '@/lib/format-time';
import { cn } from '@/lib/utils';

export function GenerationsPopover({
  generations,
  selectedId,
  onSelect,
  allRunsCount = 0,
}: {
  generations: (Generation & { projectRunNumber?: number })[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  allRunsCount?: number;
}) {
  const [open, setOpen] = useState(false);
  const sorted = [...generations].sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
  const completed = sorted.filter((g) => g.status === 'succeeded');
  const current = sorted.find((g) => g.id === selectedId) ?? sorted[0] ?? null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Switch generation"
          className="caption-uppercase inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface-strong px-2 py-1 text-ink transition-colors hover:bg-canvas-soft"
        >
          {current ? `#${current.projectRunNumber ?? current.id}` : 'No runs'}
          <ChevronDown className="h-3 w-3 text-muted-soft" aria-hidden="true" />
          <span className="sr-only">Switch generation</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <div className="border-b border-hairline px-4 py-3 flex items-center justify-between">
          <p className="caption-uppercase text-muted-strong font-semibold">Completed Runs</p>
          <span className="font-mono text-[10px] text-muted-strong bg-canvas px-2 py-0.5 rounded-full">
            {allRunsCount} runs overall
          </span>
        </div>
        {completed.length === 0 ? (
          <p className="p-6 text-sm text-body">No completed runs yet.</p>
        ) : (
          <ul className="max-h-80 overflow-auto">
            {completed.map((g) => {
              const selected = g.id === selectedId;
              const completedTime = g.completedAt ?? g.createdAt;
              const runLabel = `#${g.projectRunNumber ?? g.id}`;
              return (
                <li key={g.id} className="border-b border-hairline last:border-b-0">
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(g.id);
                      setOpen(false);
                    }}
                    aria-pressed={selected}
                    className={cn(
                      'flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors',
                      selected ? 'bg-canvas-soft' : 'hover:bg-canvas-soft',
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm text-ink">{runLabel}</span>
                      <StatusBadge status={g.status} />
                    </div>
                    <div className="flex items-center justify-between text-xs text-body">
                      <span>{g.trigger === 'manual' ? 'Manual run' : 'Webhook trigger'}</span>
                      <span className="font-mono">{formatRelativeTime(completedTime)}</span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
