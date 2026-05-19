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

const ctx = (id: string, auditUid: string) => ({ params: Promise.resolve({ id, auditUid }) });
const PAGE_URL = 'https://example.com/page';

describe('GET /api/v1/sites/[id]/citation-audits/[auditUid]', () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  it('401 when no bearer token', async () => {
    const { site } = await seed();
    const res = await GET(
      new Request('http://t'),
      ctx(site.uid, crypto.randomUUID()),
    );
    expect(res.status).toBe(401);
  });

  it('404 for a non-existent audit uid', async () => {
    const { site, token } = await seed();
    const res = await GET(
      new Request('http://t', { headers: { authorization: `Bearer ${token}` } }),
      ctx(site.uid, crypto.randomUUID()),
    );
    expect(res.status).toBe(404);
  });

  it('404 for cross-tenant (audit belongs to another user\'s site)', async () => {
    const { site: siteA } = await seed('a');
    const { site: siteB, token: tokenB } = await seed('b');

    const [audit] = await getDb()
      .insert(citationAudits)
      .values({ siteId: siteA.id, pageUrl: PAGE_URL, status: 'succeeded', trigger: 'manual' })
      .returning();

    // tokenB owner tries to reach siteA's audit via their own siteB uid
    const res = await GET(
      new Request('http://t', { headers: { authorization: `Bearer ${tokenB}` } }),
      ctx(siteB.uid, audit.uid),
    );
    expect(res.status).toBe(404);
  });

  it('200 with serialized audit for valid owner', async () => {
    const { site, token } = await seed();
    const [audit] = await getDb()
      .insert(citationAudits)
      .values({
        siteId: site.id,
        pageUrl: PAGE_URL,
        status: 'succeeded',
        trigger: 'manual',
        results: '{"checks":[]}',
      })
      .returning();

    const res = await GET(
      new Request('http://t', { headers: { authorization: `Bearer ${token}` } }),
      ctx(site.uid, audit.uid),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    // serializer: id is uid string, not numeric id
    expect(body.audit.id).toBe(audit.uid);
    // serializer: results is parsed object, not a string
    expect(typeof body.audit.results).toBe('object');
    expect(body.audit.results).toEqual({ checks: [] });
    expect(body.audit.siteId).toBe(site.uid);
  });
});
