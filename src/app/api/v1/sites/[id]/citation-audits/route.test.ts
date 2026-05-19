import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { users, sites, citationAudits, apiTokens } from '@/db/schema';
import { createApiToken } from '@/lib/tokens/api-token';

vi.mock('@/lib/citation-audit', () => ({ runCitationAudit: vi.fn() }));
vi.mock('@/lib/citation-audit/manifest-membership', () => ({
  assertPageUrlInLatestManifest: vi.fn(),
}));

import { GET, POST } from './route';
import { runCitationAudit } from '@/lib/citation-audit';
import { assertPageUrlInLatestManifest } from '@/lib/citation-audit/manifest-membership';

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
const PAGE_URL = 'https://example.com/page';

describe('GET /api/v1/sites/[id]/citation-audits', () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  it('401 when no bearer token', async () => {
    const { site } = await seed();
    const res = await GET(
      new Request(`http://t/api/v1/sites/${site.uid}/citation-audits?pageUrl=${PAGE_URL}`),
      ctx(site.uid),
    );
    expect(res.status).toBe(401);
  });

  it('401 when invalid bearer token', async () => {
    const { site } = await seed();
    const res = await GET(
      new Request(`http://t/api/v1/sites/${site.uid}/citation-audits?pageUrl=${PAGE_URL}`, {
        headers: { authorization: 'Bearer invalid-token' },
      }),
      ctx(site.uid),
    );
    expect(res.status).toBe(401);
  });

  it('404 for cross-tenant siteUid', async () => {
    const { site } = await seed('a');
    const { token: otherToken } = await seed('b');
    const res = await GET(
      new Request(`http://t/api/v1/sites/${site.uid}/citation-audits?pageUrl=${PAGE_URL}`, {
        headers: { authorization: `Bearer ${otherToken}` },
      }),
      ctx(site.uid),
    );
    expect(res.status).toBe(404);
  });

  it('200 with serialized audits for valid token', async () => {
    const { site, token } = await seed();
    const db = getDb();
    await db.insert(citationAudits).values({
      siteId: site.id,
      pageUrl: PAGE_URL,
      status: 'succeeded',
      trigger: 'manual',
      fetchedAt: '2026-05-19T00:00:00Z',
      results: '{"checks":[]}',
    });

    const res = await GET(
      new Request(`http://t/api/v1/sites/${site.uid}/citation-audits?pageUrl=${PAGE_URL}`, {
        headers: { authorization: `Bearer ${token}` },
      }),
      ctx(site.uid),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.audits).toHaveLength(1);
    // serializer: id is uid string, not numeric id
    expect(typeof body.audits[0].id).toBe('string');
    // serializer: results is parsed object, not string
    expect(typeof body.audits[0].results).toBe('object');
    expect(body.audits[0].siteId).toBe(site.uid);
  });
});

describe('POST /api/v1/sites/[id]/citation-audits', () => {
  beforeEach(async () => {
    await setupTestDb();
    vi.mocked(assertPageUrlInLatestManifest).mockResolvedValue(undefined);
  });

  it('401 when no bearer token', async () => {
    const { site } = await seed();
    const res = await POST(
      new Request('http://t', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pageUrl: PAGE_URL }) }),
      ctx(site.uid),
    );
    expect(res.status).toBe(401);
  });

  it('400 for invalid body', async () => {
    const { site, token } = await seed();
    const res = await POST(
      new Request('http://t', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      }),
      ctx(site.uid),
    );
    expect(res.status).toBe(400);
  });

  it('422 when pageUrl not in manifest', async () => {
    const { site, token } = await seed();
    const { ApiError } = await import('@/lib/auth-guards');
    vi.mocked(assertPageUrlInLatestManifest).mockRejectedValueOnce(
      new ApiError(422, 'unknown_page', 'pageUrl is not in the latest pages manifest.'),
    );
    const res = await POST(
      new Request('http://t', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ pageUrl: PAGE_URL }),
      }),
      ctx(site.uid),
    );
    expect(res.status).toBe(422);
  });

  it('200 with serialized audit on success', async () => {
    const { site, token } = await seed();
    const fakeAudit = {
      id: 1,
      uid: crypto.randomUUID(),
      siteId: site.id,
      pageUrl: PAGE_URL,
      status: 'succeeded' as const,
      score: 80,
      tier: 'good' as const,
      results: '{"checks":[]}',
      errorReason: null,
      errorMessage: null,
      fetchMs: 100,
      browserMsUsed: null,
      fetchedAt: '2026-05-19T00:00:00Z',
      trigger: 'manual' as const,
    };
    vi.mocked(runCitationAudit).mockResolvedValue(fakeAudit);

    const res = await POST(
      new Request('http://t', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ pageUrl: PAGE_URL }),
      }),
      ctx(site.uid),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    // serializer: id is uid string
    expect(body.audit.id).toBe(fakeAudit.uid);
    // serializer: results is parsed object, not a string
    expect(typeof body.audit.results).toBe('object');
    expect(body.audit.results).toEqual({ checks: [] });
  });
});
