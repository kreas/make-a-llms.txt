import { eq, desc } from 'drizzle-orm';
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
    .select()
    .from(generations)
    .where(eq(generations.siteId, site.id))
    .orderBy(desc(generations.createdAt))
    .limit(20);

  return <SiteDetailClient site={site} generations={recent} />;
}
