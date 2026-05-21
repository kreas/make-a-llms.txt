import { describe, it, expect, beforeEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { users, sites, citationAudits } from '@/db/schema';

vi.mock('./fetch', () => ({
  fetchRenderedHtml: vi.fn(),
}));
import { fetchRenderedHtml } from './fetch';
import { runCitationAudit } from './run';

const HIGH_HTML = `<!doctype html>
<html><head>
  <title>Example Co — AI</title>
  <link rel="canonical" href="https://example.com/">
  <meta name="description" content="Example Co is a strategy firm helping mid-market companies adopt AI without the hype.">
  <script type="application/ld+json">{"@type":"Service","name":"AI Strategy","provider":{"@type":"Organization","name":"Example Co"}}</script>
</head>
<body>
  <h1>AI</h1>
  <article>
    <p>Example Co is a firm helping mid-market companies adopt AI clarity.</p>
    <h2>What does this include?</h2>
    <h2>How is pricing handled?</h2>
    <ul><li>x</li></ul>
    <a href="https://example.com/about">a</a>
    <a href="https://example.com/contact">b</a>
    <a href="https://example.com/case">c</a>
  </article>
</body></html>`;

async function seedSite(): Promise<{ siteId: number }> {
  const db = getDb();
  const [u] = await db.insert(users).values({ name: 'U', email: 'u@x.test' }).returning();
  const [s] = await db.insert(sites).values({
    userId: u.id,
    name: 'Example Co',
    rootUrl: 'https://example.com',
    webhookTokenHash: 'h'.repeat(64),
    webhookTokenPrefix: 'lmt_abcd',
  }).returning();
  return { siteId: s.id };
}

describe('runCitationAudit', () => {
  beforeEach(async () => {
    await setupTestDb();
    vi.mocked(fetchRenderedHtml).mockReset();
  });

  it('persists a succeeded row on successful fetch', async () => {
    vi.mocked(fetchRenderedHtml).mockResolvedValue({
      ok: true,
      html: HIGH_HTML,
      fetchedAt: '2026-05-19T00:00:00Z',
      fetchMs: 100,
      browserMsUsed: 200,
    });
    const { siteId } = await seedSite();
    const audit = await runCitationAudit({ siteId, pageUrl: 'https://example.com/' });
    expect(audit.status).toBe('succeeded');
    expect(audit.score).not.toBeNull();
    expect(audit.results).not.toBeNull();
    expect(audit.pageUrl).toBe('https://example.com/');
    // round-trip
    const [row] = await getDb()
      .select()
      .from(citationAudits)
      .where(eq(citationAudits.id, audit.id));
    expect(row.pageUrl).toBe('https://example.com/');
    expect(row.status).toBe('succeeded');
    expect(row.fetchMs).toBe(100);
    expect(row.browserMsUsed).toBe(200);
  });

  it('uses site.displayName for entity matching when set', async () => {
    vi.mocked(fetchRenderedHtml).mockResolvedValue({
      ok: true,
      html: HIGH_HTML,
      fetchedAt: '2026-05-19T00:00:00Z',
      fetchMs: 1,
      browserMsUsed: 1,
    });
    const db = getDb();
    const [u] = await db.insert(users).values({ name: 'U2', email: 'u2@x.test' }).returning();
    // Site name is the raw host ("example.com"); displayName is the brand the
    // page actually uses. Without displayName the entity check would falsely
    // flag the page for not naming "example.com".
    const [s] = await db.insert(sites).values({
      userId: u.id,
      name: 'example.com',
      displayName: 'Example Co',
      rootUrl: 'https://example.com',
      webhookTokenHash: 'a'.repeat(64),
      webhookTokenPrefix: 'lmt_xyzz',
    }).returning();

    const audit = await runCitationAudit({ siteId: s.id, pageUrl: 'https://example.com/' });
    expect(audit.status).toBe('succeeded');
    const results = JSON.parse(audit.results!) as {
      checks: { id: string; passed: boolean }[];
    };
    const entityFirst = results.checks.find((c) => c.id === 'entity-first-paragraph');
    const answerPos = results.checks.find((c) => c.id === 'answer-position');
    expect(entityFirst?.passed).toBe(true);
    expect(answerPos?.passed).toBe(true);
  });

  it('persists a failed row on fetch error', async () => {
    vi.mocked(fetchRenderedHtml).mockResolvedValue({
      ok: false,
      reason: 'http',
      status: 404,
      message: 'Target site returned 404',
    });
    const { siteId } = await seedSite();
    const audit = await runCitationAudit({ siteId, pageUrl: 'https://example.com/missing' });
    expect(audit.status).toBe('failed');
    expect(audit.score).toBeNull();
    expect(audit.errorReason).toBe('http');
    expect(audit.errorMessage).toMatch(/404/);
  });
});
