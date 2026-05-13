import { describe, it, expect, beforeEach } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { sites, users, crawlerAudits, generations } from '@/db/schema';
import { runCrawlerAudit, __setFetchRobotsImpl } from './crawler-audit';

async function makeUserAndSite(rootUrl = 'https://example.test') {
  const db = getDb();
  const [u] = await db
    .insert(users)
    .values({ name: 'X', email: `${Math.random()}@t.test` })
    .returning();
  const [s] = await db
    .insert(sites)
    .values({
      userId: u.id,
      name: 'S',
      rootUrl,
      webhookTokenHash: 'a'.repeat(64),
      webhookTokenPrefix: 'lmt_abcd',
    })
    .returning();
  return { user: u, site: s };
}

describe('runCrawlerAudit', () => {
  beforeEach(async () => {
    await setupTestDb();
    __setFetchRobotsImpl(null); // reset to default between tests
  });

  it('200 OK: writes a succeeded row with parsed per-bot results', async () => {
    const { site } = await makeUserAndSite();
    __setFetchRobotsImpl(async () => ({
      ok: true,
      body: 'User-agent: GPTBot\nDisallow: /\n',
      robotsUrl: 'https://example.test/robots.txt',
    }));

    const audit = await runCrawlerAudit({ siteId: site.id, trigger: 'manual' });

    expect(audit.status).toBe('succeeded');
    expect(audit.robotsContent).toContain('GPTBot');
    const parsed = JSON.parse(audit.results);
    expect(parsed.GPTBot).toEqual({ status: 'blocked' });
    expect(parsed.ClaudeBot).toEqual({ status: 'default' });
  });

  it('404: writes a succeeded row with all bots default', async () => {
    const { site } = await makeUserAndSite();
    __setFetchRobotsImpl(async () => ({
      ok: false,
      kind: 'not_found',
      robotsUrl: 'https://example.test/robots.txt',
    }));

    const audit = await runCrawlerAudit({ siteId: site.id, trigger: 'manual' });

    expect(audit.status).toBe('succeeded');
    expect(audit.robotsContent).toBeNull();
    const parsed = JSON.parse(audit.results);
    expect(parsed.GPTBot).toEqual({ status: 'default' });
  });

  it('500 / network error: writes a failed row with errorMessage', async () => {
    const { site } = await makeUserAndSite();
    __setFetchRobotsImpl(async () => ({
      ok: false,
      kind: 'fetch_error',
      error: 'fetch failed',
      robotsUrl: 'https://example.test/robots.txt',
    }));

    const audit = await runCrawlerAudit({ siteId: site.id, trigger: 'manual' });

    expect(audit.status).toBe('failed');
    expect(audit.errorMessage).toContain('fetch failed');
  });

  it('oversized body: writes a failed row with a size-limit message', async () => {
    const { site } = await makeUserAndSite();
    __setFetchRobotsImpl(async () => ({
      ok: false,
      kind: 'too_large',
      error: 'robots.txt exceeds 512KB limit',
      robotsUrl: 'https://example.test/robots.txt',
    }));

    const audit = await runCrawlerAudit({ siteId: site.id, trigger: 'manual' });

    expect(audit.status).toBe('failed');
    expect(audit.errorMessage).toContain('512KB');
  });

  it('invalid_url: writes a failed row with a descriptive errorMessage', async () => {
    const { site } = await makeUserAndSite();
    __setFetchRobotsImpl(async () => ({
      ok: false,
      kind: 'invalid_url',
      error: 'Invalid URL',
      robotsUrl: 'not-a-real-url',
    }));

    const audit = await runCrawlerAudit({ siteId: site.id, trigger: 'manual' });

    expect(audit.status).toBe('failed');
    expect(audit.errorMessage).toContain('Invalid root URL');
    expect(audit.robotsUrl).toBe('not-a-real-url');
  });

  it('persists the row to crawler_audits', async () => {
    const { site } = await makeUserAndSite();
    __setFetchRobotsImpl(async () => ({
      ok: true,
      body: '',
      robotsUrl: 'https://example.test/robots.txt',
    }));

    const audit = await runCrawlerAudit({ siteId: site.id, trigger: 'manual' });

    const rows = await getDb().select().from(crawlerAudits);
    expect(rows.find((r) => r.id === audit.id)).toBeDefined();
  });

  it('sets generationId when trigger is generation', async () => {
    const { user, site } = await makeUserAndSite();
    const db = getDb();
    const [gen] = await db
      .insert(generations)
      .values({ siteId: site.id, userId: user.id, trigger: 'manual' })
      .returning();
    __setFetchRobotsImpl(async () => ({
      ok: true,
      body: '',
      robotsUrl: 'https://example.test/robots.txt',
    }));

    const audit = await runCrawlerAudit({
      siteId: site.id,
      trigger: 'generation',
      generationId: gen.id,
    });

    expect(audit.trigger).toBe('generation');
    expect(audit.generationId).toBe(gen.id);
  });

  it('never throws on missing site (returns failed row)', async () => {
    __setFetchRobotsImpl(async () => ({
      ok: true,
      body: '',
      robotsUrl: '',
    }));
    const audit = await runCrawlerAudit({ siteId: 9999, trigger: 'manual' });
    expect(audit.status).toBe('failed');
  });
});
