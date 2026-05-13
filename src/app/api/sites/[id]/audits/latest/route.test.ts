import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { sites, users, crawlerAudits } from '@/db/schema';

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

const ctx = (id: number | string) => ({ params: Promise.resolve({ id: String(id) }) });

describe('GET /api/sites/[id]/audits/latest', () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  it('returns 200 with the latest audit (by fetchedAt) for the owner', async () => {
    const { user, site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(user);

    const db = getDb();
    await db.insert(crawlerAudits).values({
      siteId: site.id,
      status: 'succeeded',
      robotsUrl: 'https://x.test/robots.txt',
      results: '{}',
      trigger: 'manual',
      fetchedAt: '2026-05-01T00:00:00Z',
    });
    const [newer] = await db
      .insert(crawlerAudits)
      .values({
        siteId: site.id,
        status: 'succeeded',
        robotsUrl: 'https://x.test/robots.txt',
        results: '{}',
        trigger: 'manual',
        fetchedAt: '2026-05-13T00:00:00Z',
      })
      .returning();

    const res = await GET(new Request('http://t'), ctx(site.id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.audit.id).toBe(newer.id);
  });

  it('returns 404 when no audit exists', async () => {
    const { user, site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(user);

    const res = await GET(new Request('http://t'), ctx(site.id));
    expect(res.status).toBe(404);
  });

  it('returns 404 for a non-owner even when an audit exists', async () => {
    const { site } = await makeUserAndSite('a@a.test');
    const { user: other } = await makeUserAndSite('b@b.test');
    vi.mocked(getCurrentUser).mockResolvedValue(other);

    await getDb().insert(crawlerAudits).values({
      siteId: site.id,
      status: 'succeeded',
      robotsUrl: 'https://x.test/robots.txt',
      results: '{}',
      trigger: 'manual',
    });

    const res = await GET(new Request('http://t'), ctx(site.id));
    expect(res.status).toBe(404);
  });

  it('returns 401 when unauthenticated', async () => {
    const { site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const res = await GET(new Request('http://t'), ctx(site.id));
    expect(res.status).toBe(401);
  });
});
