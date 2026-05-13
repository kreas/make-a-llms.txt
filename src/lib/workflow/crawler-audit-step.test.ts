import { describe, it, expect, beforeEach } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { sites, users, generations, crawlerAudits } from '@/db/schema';
import { __setFetchRobotsImpl } from '@/lib/crawler-audit';
import { runCrawlerAuditStep } from './steps';

async function seed() {
  const db = getDb();
  const [u] = await db.insert(users).values({ name: 'X', email: 'a@a.test' }).returning();
  const [s] = await db
    .insert(sites)
    .values({
      userId: u.id,
      name: 'S',
      rootUrl: 'https://example.test',
      webhookTokenHash: 'a'.repeat(64),
      webhookTokenPrefix: 'lmt_abcd',
    })
    .returning();
  const [g] = await db
    .insert(generations)
    .values({ siteId: s.id, userId: u.id, trigger: 'manual' })
    .returning();
  return { site: s, generation: g };
}

describe('runCrawlerAuditStep', () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  it('writes a crawler_audits row with trigger=generation', async () => {
    const { generation } = await seed();
    __setFetchRobotsImpl(async () => ({
      ok: true,
      body: '',
      robotsUrl: 'https://example.test/robots.txt',
    }));

    await runCrawlerAuditStep(generation.id);

    const rows = await getDb().select().from(crawlerAudits);
    expect(rows).toHaveLength(1);
    expect(rows[0].trigger).toBe('generation');
    expect(rows[0].generationId).toBe(generation.id);
  });

  it('does not throw when runCrawlerAudit throws', async () => {
    const { generation } = await seed();
    __setFetchRobotsImpl(async () => {
      throw new Error('boom');
    });

    await expect(runCrawlerAuditStep(generation.id)).resolves.toBeUndefined();
  });

  it('is a no-op when the generation row does not exist', async () => {
    await expect(runCrawlerAuditStep(9999)).resolves.toBeUndefined();
    const rows = await getDb().select().from(crawlerAudits);
    expect(rows).toHaveLength(0);
  });
});
