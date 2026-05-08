import { eq, desc } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { getDb } from '@/db';
import { sites, generations } from '@/db/schema';
import { requireUser } from '@/lib/auth-guards';
import { SiteDetailClient } from './site-detail-client';

export default async function SiteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const siteId = Number(id);
  const user = await requireUser();
  if (!Number.isInteger(siteId) || siteId <= 0) notFound();

  const [site] = await getDb()
    .select()
    .from(sites)
    .where(eq(sites.id, siteId));
  if (!site || site.userId !== user.id) notFound();

  const recent = await getDb()
    .select()
    .from(generations)
    .where(eq(generations.siteId, siteId))
    .orderBy(desc(generations.createdAt))
    .limit(20);

  return <SiteDetailClient site={site} initialGenerations={recent} />;
}
