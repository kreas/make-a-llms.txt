'use client';
import { CitationsTierPill } from './citations-tier-pill';
import { formatRelativeTime } from '@/lib/format-time';

type HistoryItem = {
  id: string;
  score: number | null;
  tier: 'poor' | 'fair' | 'good' | 'excellent' | null;
  fetchedAt: string;
  status: 'succeeded' | 'failed';
};

export function CitationsHistoryList({ items, currentId, onSelect }: {
  items: HistoryItem[]; currentId: string; onSelect: (id: string) => void;
}) {
  if (items.length <= 1) return null;
  return (
    <ul className="flex flex-col gap-1">
      {items.map((it) => (
        <li key={it.id}>
          <button
            type="button"
            onClick={() => onSelect(it.id)}
            className="w-full text-left flex items-center gap-3 px-3 py-2 rounded-md hover:bg-canvas-soft"
            aria-current={it.id === currentId ? 'true' : undefined}
          >
            <span className="text-body text-sm w-28">{formatRelativeTime(it.fetchedAt)}</span>
            <span className="font-mono w-12">{it.score ?? '—'}</span>
            <CitationsTierPill tier={it.tier ?? 'none'} />
            {it.id === currentId && <span className="text-xs text-body ml-2">(current)</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}
