import { desc, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db';
import { sites, generations, type Generation } from '@/db/schema';
import { requireUser } from '@/lib/auth-guards';
import { SitesList } from '@/components/sites/sites-list';

export default async function DashboardPage() {
  const user = await requireUser();
  const db = getDb();

  const userSites = await db.select().from(sites).where(eq(sites.userId, user.id));
  const siteIds = userSites.map((s) => s.id);

  const latestBySiteId: Record<number, Generation | null> = {};
  if (siteIds.length > 0) {
    const allGens = await db
      .select()
      .from(generations)
      .where(inArray(generations.siteId, siteIds))
      .orderBy(desc(generations.createdAt));
    for (const g of allGens) {
      if (latestBySiteId[g.siteId] === undefined) {
        latestBySiteId[g.siteId] = g;
      }
    }
  }

  return (
    <div className="flex flex-col gap-12">
      <header>
        <h1 className="display-lg text-ink">Your Projects</h1>
        <p className="mt-2 text-base text-muted-strong">Manage your website documentation for LLMs.</p>
      </header>
      <SitesList sites={userSites} latestBySiteId={latestBySiteId} />
    </div>
  );
}
