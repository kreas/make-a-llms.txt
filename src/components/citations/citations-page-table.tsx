'use client';
import { CitationsTierPill } from './citations-tier-pill';
import { formatRelativeTime } from '@/lib/format-time';

type Row = {
  pageUrl: string;
  score: number | null;
  tier: 'poor' | 'fair' | 'good' | 'excellent' | null;
  fetchedAt: string | null;
};

export function CitationsPageTable({ rows, onSelect }: { rows: Row[]; onSelect: (pageUrl: string) => void }) {
  if (rows.length === 0) {
    return <p className="text-body">No pages found in the latest generation manifest.</p>;
  }
  return (
    <table className="w-full text-sm border border-hairline rounded-lg overflow-hidden">
      <thead className="bg-canvas-soft text-body caption-uppercase text-xs">
        <tr>
          <th className="text-left px-3 py-2">URL</th>
          <th className="text-left px-3 py-2 w-20">Score</th>
          <th className="text-left px-3 py-2 w-24">Tier</th>
          <th className="text-left px-3 py-2 w-28">Last audited</th>
          <th className="w-6"></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.pageUrl} className="border-t border-hairline hover:bg-canvas-soft/50 cursor-pointer" onClick={() => onSelect(r.pageUrl)}>
            <td className="px-3 py-2 truncate max-w-[420px]" title={r.pageUrl}>{r.pageUrl}</td>
            <td className="px-3 py-2 font-mono">{r.score ?? '—'}</td>
            <td className="px-3 py-2"><CitationsTierPill tier={r.tier ?? 'none'} /></td>
            <td className="px-3 py-2 text-body">{r.fetchedAt ? formatRelativeTime(r.fetchedAt) : 'Never'}</td>
            <td className="px-3 py-2 text-body">›</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
