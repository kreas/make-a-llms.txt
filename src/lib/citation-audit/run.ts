import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { sites, citationAudits } from '@/db/schema';
import type { CitationAudit } from '@/db/schema';
import { fetchRenderedHtml } from './fetch';
import { auditPage } from './audit-page';

export async function runCitationAudit(opts: {
  siteId: number;
  pageUrl: string;
}): Promise<CitationAudit> {
  const db = getDb();
  const [site] = await db.select().from(sites).where(eq(sites.id, opts.siteId));
  if (!site) throw new Error(`site ${opts.siteId} not found`);

  const fetched = await fetchRenderedHtml(opts.pageUrl);
  if (!fetched.ok) {
    const [row] = await db.insert(citationAudits).values({
      siteId: opts.siteId,
      pageUrl: opts.pageUrl,
      status: 'failed',
      errorReason: fetched.reason,
      errorMessage: fetched.message,
      trigger: 'manual',
    }).returning();
    return row;
  }

  const result = await auditPage({
    url: opts.pageUrl,
    entityName: site.displayName ?? site.name,
    html: fetched.html,
    fetchedAt: fetched.fetchedAt,
  });

  const [row] = await db.insert(citationAudits).values({
    siteId: opts.siteId,
    pageUrl: opts.pageUrl,
    status: 'succeeded',
    score: result.score,
    tier: result.tier,
    results: JSON.stringify(result),
    fetchMs: fetched.fetchMs,
    browserMsUsed: fetched.browserMsUsed,
    trigger: 'manual',
  }).returning();
  return row;
}
