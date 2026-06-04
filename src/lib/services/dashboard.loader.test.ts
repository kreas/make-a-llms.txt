import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestDb, resetTestDb, type TestDb } from '@/test/db';
import { users, sites, citationAudits } from '@/db/schema';
import { loadDashboardData } from './dashboard';

let db: TestDb;
beforeEach(async () => { db = await setupTestDb(); });
afterEach(() => resetTestDb());

describe('loadDashboardData', () => {
  it('aggregates per-site scores and stats for a user', async () => {
    const [u] = await db.insert(users).values({ name: 'T', email: 't@x.com' }).returning();
    const [s] = await db.insert(sites).values({
      userId: u.id, name: 'a.com', rootUrl: 'https://a.com',
      webhookTokenHash: 'h', webhookTokenPrefix: 'p',
    }).returning();
    await db.insert(citationAudits).values({
      siteId: s.id, pageUrl: 'https://a.com/', status: 'succeeded', score: 80, tier: 'good',
      trigger: 'manual',
      results: JSON.stringify({ checks: [
        { id: 'answer-position', passed: true, score: 80, weight: 15, evidence: [], recommendation: null },
        { id: 'h1-present', passed: false, score: 0, weight: 5, evidence: [], recommendation: 'Add H1' },
      ] }),
    });

    const data = await loadDashboardData(u.id);
    expect(data.rows).toHaveLength(1);
    expect(data.rows[0].scores.readable?.score).toBe(60); // weighted (80*15+0*5)/20
    expect(data.rows[0].issues).toBe(1);
    expect(data.stats.sitesMonitored).toBe(1);
    expect(data.stats.openIssues).toBe(1);
  });

  it('returns empty rows and null avg for a user with no sites', async () => {
    const [u] = await db.insert(users).values({ name: 'E', email: 'e@x.com' }).returning();
    const data = await loadDashboardData(u.id);
    expect(data.rows).toHaveLength(0);
    expect(data.stats.avgReadiness).toBeNull();
    expect(data.trend).toBeNull();
  });
});
