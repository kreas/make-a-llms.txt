import { eq, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { sites } from '@/db/schema';
import { extractSiteMetadata } from './extract';

export async function fetchAndPersistSiteMetadata(siteId: number, rootUrl: string): Promise<void> {
  const outcome = await extractSiteMetadata(rootUrl);
  if (!outcome.ok) return;
  const { metadata } = outcome;
  await getDb()
    .update(sites)
    .set({
      displayName: metadata.name,
      description: metadata.description,
      faviconUrl: metadata.faviconUrl,
      metadataFetchedAt: sql`(current_timestamp)`,
      updatedAt: sql`(current_timestamp)`,
    })
    .where(eq(sites.id, siteId));
}
