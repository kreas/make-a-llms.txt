import { eq, desc, sql } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { getDb } from '@/db';
import { sites, generations } from '@/db/schema';
import { requireUser } from '@/lib/auth-guards';
import { parseUid } from '@/lib/uid';
import { ZodError } from 'zod';
import { SiteDetailClient } from './site-detail-client';

export default async function SiteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();

  let siteUid: string;
  try {
    siteUid = parseUid(id);
  } catch (e) {
    if (e instanceof ZodError) notFound();
    throw e;
  }

  const [site] = await getDb().select().from(sites).where(eq(sites.uid, siteUid));
  if (!site || site.userId !== user.id) notFound();

  const recent = await getDb()
    .select({
      generation: generations,
      projectRunNumber: sql<number>`row_number() over (order by ${generations.id} asc)`,
    })
    .from(generations)
    .where(eq(generations.siteId, site.id))
    .orderBy(desc(generations.id))
    .limit(20);

  const recentMapped = recent.map(({ generation, projectRunNumber }) => ({
    ...generation,
    projectRunNumber,
  }));

  const [allRunsCountResult] = await getDb()
    .select({ count: sql<number>`count(*)` })
    .from(generations);
  const allRunsCount = allRunsCountResult?.count ?? 0;

  return <SiteDetailClient site={site} generations={recentMapped} allRunsCount={allRunsCount} />;
}
