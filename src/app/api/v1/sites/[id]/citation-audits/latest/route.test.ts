import { describe, it, expect, beforeEach } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { users, sites, citationAudits, apiTokens } from '@/db/schema';
import { createApiToken } from '@/lib/tokens/api-token';

import { GET } from './route';

async function seed(emailSuffix = 'a') {
  const db = getDb();
  const [u] = await db.insert(users).values({ name: 'U', email: `${emailSuffix}@a.test` }).returning();
  const prefix = emailSuffix.slice(0, 4).padEnd(4, 'x');
  const hash = prefix.repeat(16);
  const [s] = await db
    .insert(sites)
    .values({
      userId: u.id,
      name: 'S',
      rootUrl: `https://${emailSuffix}.test`,
      webhookTokenHash: hash,
      webhookTokenPrefix: `lmt_${prefix}`,
    })
    .returning();
  const { token, hash: tokHash, prefix: tokPrefix } = createApiToken();
  await db.insert(apiTokens).values({ userId: u.id, name: 'CI', tokenHash: tokHash, tokenPrefix: tokPrefix });
  return { user: u, site: s, token };
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe('GET /api/v1/sites/[id]/citation-audits/latest', () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  it('401 when no bearer token', async () => {
    const { site } = await seed();
    const res = await GET(new Request('http://t'), ctx(site.uid));
    expect(res.status).toBe(401);
  });

  it('404 for cross-tenant siteUid', async () => {
    const { site } = await seed('a');
    const { token: otherToken } = await seed('b');
    const res = await GET(
      new Request('http://t', { headers: { authorization: `Bearer ${otherToken}` } }),
      ctx(site.uid),
    );
    expect(res.status).toBe(404);
  });

  it('returns one serialized row per pageUrl (latest only)', async () => {
    const { site, token } = await seed();
    const db = getDb();
    const PAGE_A = 'https://example.com/a';
    const PAGE_B = 'https://example.com/b';

    // Two audits for PAGE_A — newer should win
    await db.insert(citationAudits).values({
      siteId: site.id,
      pageUrl: PAGE_A,
      status: 'succeeded',
      trigger: 'manual',
      fetchedAt: '2026-05-10T00:00:00Z',
      results: '{"checks":[1]}',
    });
    const [newerA] = await db
      .insert(citationAudits)
      .values({
        siteId: site.id,
        pageUrl: PAGE_A,
        status: 'succeeded',
        trigger: 'manual',
        fetchedAt: '2026-05-12T00:00:00Z',
        results: '{"checks":[2]}',
      })
      .returning();

    await db.insert(citationAudits).values({
      siteId: site.id,
      pageUrl: PAGE_B,
      status: 'failed',
      trigger: 'manual',
      fetchedAt: '2026-05-11T00:00:00Z',
    });

    const res = await GET(
      new Request('http://t', { headers: { authorization: `Bearer ${token}` } }),
      ctx(site.uid),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.audits).toHaveLength(2);

    const rowA = body.audits.find((a: { pageUrl: string }) => a.pageUrl === PAGE_A);
    // serializer: id is uid string
    expect(rowA.id).toBe(newerA.uid);
    // serializer: results is parsed object
    expect(typeof rowA.results).toBe('object');
    expect(rowA.results).toEqual({ checks: [2] });
    expect(rowA.siteId).toBe(site.uid);
  });
});
