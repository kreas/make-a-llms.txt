import type { Site, Generation } from '@/db/schema';
import { SiteCard } from './site-card';
import { AddSiteCard } from './add-site-card';

export function SitesList({
  sites,
  latestBySiteId,
}: {
  sites: Site[];
  latestBySiteId: Record<number, Generation | null>;
}) {
  if (sites.length === 0) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <AddSiteCard />
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {sites.map((s) => (
        <SiteCard key={s.id} site={s} latest={latestBySiteId[s.id] ?? null} />
      ))}
      <AddSiteCard />
    </div>
  );
}
