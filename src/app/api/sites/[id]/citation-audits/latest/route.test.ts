import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { sites, users, citationAudits } from '@/db/schema';

vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }));

import { GET } from './route';
import { getCurrentUser } from '@/lib/auth';

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

describe('GET /api/sites/[id]/citation-audits/latest', () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  it('returns 401 when unauthenticated', async () => {
    const { site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const res = await GET(new Request('http://t'), ctx(site.uid));
    expect(res.status).toBe(401);
  });

  it('returns 404 for cross-tenant site', async () => {
    const { site } = await makeUserAndSite('a@a.test');
    const { user: other } = await makeUserAndSite('b@b.test');
    vi.mocked(getCurrentUser).mockResolvedValue(other);

    const res = await GET(new Request('http://t'), ctx(site.uid));
    expect(res.status).toBe(404);
  });

  it('returns one row per pageUrl (latest only), descending by fetchedAt', async () => {
    const { user, site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(user);

    const db = getDb();
    const PAGE_A = 'https://example.com/a';
    const PAGE_B = 'https://example.com/b';

    // Two audits for PAGE_A — the newer one should win
    await db.insert(citationAudits).values({
      siteId: site.id,
      pageUrl: PAGE_A,
      status: 'succeeded',
      trigger: 'manual',
      fetchedAt: '2026-05-10T00:00:00Z',
    });
    const [newerA] = await db
      .insert(citationAudits)
      .values({
        siteId: site.id,
        pageUrl: PAGE_A,
        status: 'succeeded',
        trigger: 'manual',
        fetchedAt: '2026-05-12T00:00:00Z',
      })
      .returning();

    const [auditB] = await db
      .insert(citationAudits)
      .values({
        siteId: site.id,
        pageUrl: PAGE_B,
        status: 'failed',
        trigger: 'manual',
        fetchedAt: '2026-05-11T00:00:00Z',
      })
      .returning();

    const res = await GET(new Request('http://t'), ctx(site.uid));
    expect(res.status).toBe(200);
    const body = await res.json();
    // Exactly one row per unique pageUrl
    expect(body.audits).toHaveLength(2);
    const urls = body.audits.map((a: { pageUrl: string }) => a.pageUrl);
    expect(urls).toContain(PAGE_A);
    expect(urls).toContain(PAGE_B);
    // The latest audit for PAGE_A is the newer one
    const rowA = body.audits.find((a: { pageUrl: string }) => a.pageUrl === PAGE_A);
    expect(rowA.id).toBe(newerA.id);
    // PAGE_B has only one audit
    const rowB = body.audits.find((a: { pageUrl: string }) => a.pageUrl === PAGE_B);
    expect(rowB.id).toBe(auditB.id);
  });
});
