import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { sites } from '@/db/schema';
import { requireUser } from '@/lib/auth-guards';
import { SitesList } from '@/components/sites/sites-list';

export default async function DashboardPage() {
  const user = await requireUser();
  const userSites = await getDb()
    .select()
    .from(sites)
    .where(eq(sites.userId, user.id));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="display-lg text-ink">Sites</h1>
        <Link
          href="/sites/new"
          className="inline-flex h-10 items-center rounded-md bg-ink px-4 text-sm text-canvas"
        >
          + New site
        </Link>
      </div>
      <SitesList sites={userSites} />
    </div>
  );
}
