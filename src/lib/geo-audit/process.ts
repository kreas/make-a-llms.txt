import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { sites, siteGeoAudits } from '@/db/schema';
import type { SiteGeoAudit } from '@/db/schema';
import { startCrawl, pollCrawl } from './crawl';
import { confirmCandidate } from './confirm';
import { analyzeGeoPages } from './analyze';
import type { Goal, SiteType } from './types';

const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 40; // ~2 min ceiling

async function setRow(id: number, fields: Partial<SiteGeoAudit>): Promise<void> {
  await getDb().update(siteGeoAudits).set(fields).where(eq(siteGeoAudits.id, id));
}

/** Orchestration core — called by the workflow step; testable directly. */
export async function processGeoAudit(auditId: number): Promise<void> {
  const db = getDb();
  const [audit] = await db.select().from(siteGeoAudits).where(eq(siteGeoAudits.id, auditId));
  if (!audit) return;
  const [site] = await db.select().from(sites).where(eq(sites.id, audit.siteId));
  if (!site) {
    await setRow(auditId, { status: 'failed', errorReason: 'no_site', errorMessage: 'Site not found' });
    return;
  }

  const siteType = (audit.siteType ?? 'other') as SiteType;
  const goal = (audit.goal ?? 'get-cited') as Goal;
  const t0 = Date.now();

  try {
    await setRow(auditId, { status: 'running', stage: 'crawling' });
    const jobId = await startCrawl(site.rootUrl);
    await setRow(auditId, { crawlJobId: jobId });

    let poll = await pollCrawl(jobId);
    for (let i = 0; i < MAX_POLLS && poll.status === 'running'; i++) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      poll = await pollCrawl(jobId);
    }
    if (poll.status !== 'completed') {
      await setRow(auditId, { status: 'failed', errorReason: 'crawl_failed', errorMessage: `Crawl ${poll.status}` });
      return;
    }
    if (poll.pages.length === 0) {
      await setRow(auditId, { status: 'failed', errorReason: 'no_pages', errorMessage: 'Crawl returned no pages' });
      return;
    }

    await setRow(auditId, { stage: 'confirming' });
    const result = await analyzeGeoPages(
      poll.pages,
      { entityName: site.displayName ?? site.name, siteType, goal },
      confirmCandidate,
    );

    await setRow(auditId, {
      status: 'succeeded',
      stage: 'scoring',
      score: result.score,
      tier: result.tier,
      results: JSON.stringify(result),
      llmMsUsed: Date.now() - t0,
    });
  } catch (err) {
    await setRow(auditId, {
      status: 'failed',
      errorReason: 'analysis_failed',
      errorMessage: err instanceof Error ? err.message : String(err),
    });
  }
}
