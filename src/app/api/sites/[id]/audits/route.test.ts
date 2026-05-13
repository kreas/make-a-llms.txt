import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { sites, users } from '@/db/schema';
import { __setFetchRobotsImpl } from '@/lib/crawler-audit';

vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }));

import { POST } from './route';
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

describe('POST /api/sites/[id]/audits', () => {
  beforeEach(async () => {
    await setupTestDb();
    __setFetchRobotsImpl(async () => ({
      ok: true,
      body: 'User-agent: GPTBot\nDisallow: /\n',
      robotsUrl: 'https://x.test/robots.txt',
    }));
  });

  it('returns 200 with the new audit for the owner', async () => {
    const { user, site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(user);

    const res = await POST(new Request('http://t', { method: 'POST' }), ctx(site.id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.audit.siteId).toBe(site.id);
    expect(body.audit.trigger).toBe('manual');
    expect(body.audit.status).toBe('succeeded');
  });

  it('returns 404 for a non-owner', async () => {
    const { site } = await makeUserAndSite('a@a.test');
    const { user: other } = await makeUserAndSite('b@b.test');
    vi.mocked(getCurrentUser).mockResolvedValue(other);

    const res = await POST(new Request('http://t', { method: 'POST' }), ctx(site.id));
    expect(res.status).toBe(404);
  });

  it('returns 401 when unauthenticated', async () => {
    const { site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const res = await POST(new Request('http://t', { method: 'POST' }), ctx(site.id));
    expect(res.status).toBe(401);
  });
});
