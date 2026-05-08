import Link from 'next/link';
import type { Generation } from '@/db/schema';
import { StatusBadge } from './status-badge';

export function GenerationsTable({ generations }: { generations: Generation[] }) {
  if (generations.length === 0) {
    return <p className="text-sm text-body">No generations yet.</p>;
  }
  const sorted = [...generations].sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left caption-uppercase text-muted-strong">
          <th className="py-2">ID</th>
          <th className="py-2">Status</th>
          <th className="py-2">Trigger</th>
          <th className="py-2">Created</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {sorted.map((g) => (
          <tr key={g.id} className="border-t border-hairline">
            <td className="py-2 font-mono">#{g.id}</td>
            <td className="py-2">
              <StatusBadge status={g.status} />
            </td>
            <td className="py-2">{g.trigger}</td>
            <td className="py-2 font-mono text-body">{g.createdAt}</td>
            <td className="py-2 text-right">
              <Link href={`/g/${g.id}`} className="text-ink hover:underline">
                View →
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
