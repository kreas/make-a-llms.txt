import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { sites, users, siteGeoAudits } from '@/db/schema';
import { eq } from 'drizzle-orm';

vi.mock('./crawl', () => ({ startCrawl: vi.fn(), pollCrawl: vi.fn() }));
vi.mock('./confirm', () => ({ confirmCandidate: vi.fn() }));

import { startCrawl, pollCrawl } from './crawl';
import { confirmCandidate } from './confirm';
import { processGeoAudit } from './process';

async function seed(siteType = 'saas', goal = 'get-cited') {
  const db = getDb();
  const [u] = await db.insert(users).values({ name: 'U', email: 'u@u.test' }).returning();
  const [s] = await db.insert(sites).values({
    userId: u.id, name: 'Acme', rootUrl: 'https://acme.test',
    webhookTokenHash: 'h'.repeat(64), webhookTokenPrefix: 'lmt_acme',
    siteType, geoGoal: goal,
  }).returning();
  const [a] = await db.insert(siteGeoAudits).values({
    siteId: s.id, status: 'pending', trigger: 'manual', siteType, goal,
  }).returning();
  return { site: s, audit: a };
}

describe('processGeoAudit', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await setupTestDb();
  });

  it('crawls, confirms, scores, and marks the row succeeded', async () => {
    const { audit } = await seed('saas', 'get-cited');
    vi.mocked(startCrawl).mockResolvedValue('job-1');
    vi.mocked(pollCrawl).mockResolvedValue({
      status: 'completed',
      pages: [{ url: 'https://acme.test/pricing', path: 'pricing', markdown: 'Plans from $29/mo.' }],
    });
    vi.mocked(confirmCandidate).mockResolvedValue({ confirmed: true, artifact: 'from $29/mo' });

    await processGeoAudit(audit.id);

    const [row] = await getDb().select().from(siteGeoAudits).where(eq(siteGeoAudits.id, audit.id));
    expect(row.status).toBe('succeeded');
    expect(row.score).toBeGreaterThan(0);
    expect(row.crawlJobId).toBe('job-1');
  });

  it('marks the row failed when the crawl fails', async () => {
    const { audit } = await seed();
    vi.mocked(startCrawl).mockResolvedValue('job-2');
    vi.mocked(pollCrawl).mockResolvedValue({ status: 'failed', pages: [] });

    await processGeoAudit(audit.id);
    const [row] = await getDb().select().from(siteGeoAudits).where(eq(siteGeoAudits.id, audit.id));
    expect(row.status).toBe('failed');
    expect(row.errorReason).toBe('crawl_failed');
  });
});
