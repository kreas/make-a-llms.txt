import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { sites, users } from '@/db/schema';
import { eq } from 'drizzle-orm';

vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }));
import { POST } from './route';
import { getCurrentUser } from '@/lib/auth';

async function makeUserAndSite(email: string) {
  const db = getDb();
  const [u] = await db.insert(users).values({ name: 'A', email }).returning();
  const prefix = email.split('@')[0].slice(0, 4).padEnd(4, 'x');
  const hash = prefix.repeat(16); // 64 chars, unique per email prefix
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

describe('POST rotate-token', () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  it('issues a new token and replaces the hash', async () => {
    const { user, site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(user);

    const res = await POST(new Request('http://t', { method: 'POST' }), ctx(site.uid));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.webhookToken).toMatch(/^lmt_/);

    const [after] = await getDb().select().from(sites).where(eq(sites.id, site.id));
    expect(after.webhookTokenHash).not.toBe('a'.repeat(64));
  });

  it('returns 400 for non-UUID id', async () => {
    const { user } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(user);

    const res = await POST(new Request('http://t', { method: 'POST' }), ctx('not-a-uuid'));
    expect(res.status).toBe(400);
  });

  it('returns 404 for a non-owner (cross-tenant)', async () => {
    const { site } = await makeUserAndSite('a@a.test');
    const { user: other } = await makeUserAndSite('b@b.test');
    vi.mocked(getCurrentUser).mockResolvedValue(other);

    const res = await POST(new Request('http://t', { method: 'POST' }), ctx(site.uid));
    expect(res.status).toBe(404);
  });

  it('returns 401 when unauthenticated', async () => {
    const { site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const res = await POST(new Request('http://t', { method: 'POST' }), ctx(site.uid));
    expect(res.status).toBe(401);
  });
});
