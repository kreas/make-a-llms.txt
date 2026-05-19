import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { sites, users, citationAudits } from '@/db/schema';

vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/lib/citation-audit', () => ({ runCitationAudit: vi.fn() }));
vi.mock('@/lib/citation-audit/manifest-membership', () => ({
  assertPageUrlInLatestManifest: vi.fn(),
}));

import { GET, POST } from './route';
import { getCurrentUser } from '@/lib/auth';
import { runCitationAudit } from '@/lib/citation-audit';
import { assertPageUrlInLatestManifest } from '@/lib/citation-audit/manifest-membership';

async function makeUserAndSite(email: string) {
  const db = getDb();
  const [u] = await db.insert(users).values({ name: 'X', email }).returning();
  const prefix = email.split('@')[0].slice(0, 4).padEnd(4, 'x');
  const hash = prefix.repeat(16);
  const [s] = await db
    .insert(sites)
    .values({
      userId: u.id,
      name: 'S',
      rootUrl: `https://${email.split('@')[0]}.test`,
      webhookTokenHash: hash,
      webhookTokenPrefix: `lmt_${prefix}`,
    })
    .returning();
  return { user: u, site: s };
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

const PAGE_URL = 'https://example.com/page';

describe('GET /api/sites/[id]/citation-audits', () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  it('returns 401 when unauthenticated', async () => {
    const { site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const res = await GET(new Request(`http://t?pageUrl=${PAGE_URL}`), ctx(site.uid));
    expect(res.status).toBe(401);
  });

  it('returns 404 for cross-tenant site', async () => {
    const { site } = await makeUserAndSite('a@a.test');
    const { user: other } = await makeUserAndSite('b@b.test');
    vi.mocked(getCurrentUser).mockResolvedValue(other);

    const res = await GET(new Request(`http://t?pageUrl=${PAGE_URL}`), ctx(site.uid));
    expect(res.status).toBe(404);
  });

  it('returns audits filtered by pageUrl in descending fetchedAt order', async () => {
    const { user, site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(user);

    const db = getDb();
    const OTHER_URL = 'https://example.com/other';
    await db.insert(citationAudits).values({
      siteId: site.id,
      pageUrl: OTHER_URL,
      status: 'succeeded',
      trigger: 'manual',
      fetchedAt: '2026-05-10T00:00:00Z',
    });
    const [older] = await db
      .insert(citationAudits)
      .values({
        siteId: site.id,
        pageUrl: PAGE_URL,
        status: 'succeeded',
        trigger: 'manual',
        fetchedAt: '2026-05-11T00:00:00Z',
      })
      .returning();
    const [newer] = await db
      .insert(citationAudits)
      .values({
        siteId: site.id,
        pageUrl: PAGE_URL,
        status: 'succeeded',
        trigger: 'manual',
        fetchedAt: '2026-05-12T00:00:00Z',
      })
      .returning();

    const res = await GET(new Request(`http://t?pageUrl=${PAGE_URL}`), ctx(site.uid));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.audits).toHaveLength(2);
    expect(body.audits[0].id).toBe(newer.id);
    expect(body.audits[1].id).toBe(older.id);
  });
});

describe('POST /api/sites/[id]/citation-audits', () => {
  beforeEach(async () => {
    await setupTestDb();
    vi.mocked(assertPageUrlInLatestManifest).mockResolvedValue(undefined);
  });

  it('returns 401 when unauthenticated', async () => {
    const { site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const res = await POST(
      new Request('http://t', { method: 'POST', body: JSON.stringify({ pageUrl: PAGE_URL }) }),
      ctx(site.uid),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 for cross-tenant site', async () => {
    const { site } = await makeUserAndSite('a@a.test');
    const { user: other } = await makeUserAndSite('b@b.test');
    vi.mocked(getCurrentUser).mockResolvedValue(other);

    const res = await POST(
      new Request('http://t', { method: 'POST', body: JSON.stringify({ pageUrl: PAGE_URL }) }),
      ctx(site.uid),
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid body (missing pageUrl)', async () => {
    const { user, site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(user);

    const res = await POST(
      new Request('http://t', { method: 'POST', body: JSON.stringify({}) }),
      ctx(site.uid),
    );
    expect(res.status).toBe(400);
  });

  it('returns 422 when pageUrl not in manifest', async () => {
    const { user, site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(user);

    const { ApiError } = await import('@/lib/auth-guards');
    vi.mocked(assertPageUrlInLatestManifest).mockRejectedValueOnce(
      new ApiError(422, 'unknown_page', 'pageUrl is not in the latest pages manifest.'),
    );

    const res = await POST(
      new Request('http://t', { method: 'POST', body: JSON.stringify({ pageUrl: PAGE_URL }) }),
      ctx(site.uid),
    );
    expect(res.status).toBe(422);
  });

  it('returns 200 with audit on success', async () => {
    const { user, site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(user);

    const fakeAudit = {
      id: 1,
      uid: 'abc-123',
      siteId: site.id,
      pageUrl: PAGE_URL,
      status: 'succeeded' as const,
      score: 80,
      tier: 'good' as const,
      results: '{}',
      errorReason: null,
      errorMessage: null,
      fetchMs: 100,
      browserMsUsed: null,
      fetchedAt: '2026-05-19T00:00:00Z',
      trigger: 'manual' as const,
    };
    vi.mocked(runCitationAudit).mockResolvedValue(fakeAudit);

    const res = await POST(
      new Request('http://t', { method: 'POST', body: JSON.stringify({ pageUrl: PAGE_URL }) }),
      ctx(site.uid),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.audit.siteId).toBe(site.id);
    expect(body.audit.status).toBe('succeeded');
  });
});
