import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { sites, type Site } from '@/db/schema';
import type { SitePublic } from '@/lib/types/public';

export async function getSiteByUid(siteUid: string, userId: number): Promise<Site | null> {
  const [row] = await getDb()
    .select()
    .from(sites)
    .where(and(eq(sites.uid, siteUid), eq(sites.userId, userId)));
  return row ?? null;
}

export async function listSitesForUser(userId: number): Promise<Site[]> {
  return getDb().select().from(sites).where(eq(sites.userId, userId));
}

export function toPublicSite(s: Site): SitePublic {
  return {
    id: s.uid,
    name: s.name,
    rootUrl: s.rootUrl,
    sitemapUrl: s.sitemapUrl,
    webhookTokenPrefix: s.webhookTokenPrefix,
    lastGeneratedAt: s.lastGeneratedAt,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}
