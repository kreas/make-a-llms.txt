import Link from 'next/link';
import type { Site } from '@/db/schema';

export function SitesList({ sites }: { sites: Site[] }) {
  if (sites.length === 0) {
    return (
      <div className="rounded-lg border border-hairline bg-surface-card p-8 text-center">
        <p className="display-sm text-ink">Add your first site</p>
        <p className="mt-2 text-body">Create a site to start generating llms.txt files.</p>
        <Link
          href="/sites/new"
          className="mt-4 inline-flex h-10 items-center rounded-md bg-ink px-4 text-canvas"
        >
          New site
        </Link>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {sites.map((s) => (
        <li
          key={s.id}
          className="flex items-center justify-between rounded-lg border border-hairline bg-surface-card p-4"
        >
          <div>
            <div className="title-md text-ink">{s.name}</div>
            <div className="text-sm text-body">{s.rootUrl}</div>
          </div>
          <Link
            href={`/sites/${s.id}`}
            className="caption-uppercase text-muted-strong hover:text-ink"
          >
            Open →
          </Link>
        </li>
      ))}
    </ul>
  );
}
