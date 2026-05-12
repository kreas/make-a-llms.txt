'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Generation } from '@/db/schema';
import { cn } from '@/lib/utils';
import { StatusBadge } from './status-badge';
import { formatRelativeTime } from '@/lib/format-time';

export function GenerationsSidebar({
  generations,
  selectedId,
  onSelect,
  collapsed,
  onToggleCollapse,
}: {
  generations: Generation[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  if (collapsed) {
    return (
      <div className="flex flex-col items-center rounded-lg border border-hairline bg-surface-card py-3">
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label="Show runs"
          className="rounded p-1.5 text-muted-strong transition-colors hover:bg-canvas-soft hover:text-ink"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>
    );
  }

  const sorted = [...generations].sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));

  return (
    <div className="flex flex-col rounded-lg border border-hairline bg-surface-card">
      <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
        <h2 className="text-lg font-semibold text-ink">Generations</h2>
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label="Hide runs"
          className="rounded p-1 text-muted-strong transition-colors hover:bg-canvas-soft hover:text-ink"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      {generations.length === 0 ? (
        <p className="p-6 text-sm text-body">No generations yet.</p>
      ) : (
        <ul className="max-h-[640px] overflow-auto">
          {sorted.map((g) => {
            const selected = g.id === selectedId;
            return (
              <li key={g.id} className="border-b border-hairline last:border-b-0">
                <button
                  type="button"
                  onClick={() => onSelect(g.id)}
                  aria-pressed={selected}
                  className={cn(
                    'flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors',
                    selected ? 'bg-canvas-soft' : 'hover:bg-canvas-soft',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm text-ink">#{g.id}</span>
                    <StatusBadge status={g.status} />
                  </div>
                  <div className="flex items-center justify-between text-xs text-body">
                    <span>{g.trigger}</span>
                    <span className="font-mono">{formatRelativeTime(g.createdAt)}</span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
