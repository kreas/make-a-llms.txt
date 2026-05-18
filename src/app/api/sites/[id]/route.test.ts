import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { sites, users } from '@/db/schema';

vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }));

import { GET, PATCH, DELETE } from './route';
import { getCurrentUser } from '@/lib/auth';

async function makeUserAndSite(email: string) {
  const db = getDb();
  const [u] = await db.insert(users).values({ name: 'X', email }).returning();
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

describe('site id route', () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  it('GET returns the site with uid as id', async () => {
    const { user, site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(user);

    const res = await GET(new Request('http://t'), ctx(site.uid));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.site.id).toBe(site.uid);
    expect(body.site.userId).toBeUndefined();
    expect(body.site.webhookTokenHash).toBeUndefined();
  });

  it('GET returns 400 for non-UUID id', async () => {
    const { user } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(user);

    const res = await GET(new Request('http://t'), ctx('not-a-uuid'));
    expect(res.status).toBe(400);
  });

  it('GET returns 404 for non-owner (cross-tenant)', async () => {
    const { site } = await makeUserAndSite('a@a.test');
    const { user: other } = await makeUserAndSite('b@b.test');
    vi.mocked(getCurrentUser).mockResolvedValue(other);

    const res = await GET(new Request('http://t'), ctx(site.uid));
    expect(res.status).toBe(404);
  });

  it('PATCH updates name and returns toPublicSite shape', async () => {
    const { user, site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(user);

    const res = await PATCH(
      new Request('http://t', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'New' }),
      }),
      ctx(site.uid),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.site.name).toBe('New');
    expect(body.site.id).toBe(site.uid);
    expect(body.site.userId).toBeUndefined();
    expect(body.site.webhookTokenHash).toBeUndefined();
  });

  it('PATCH returns 400 for non-UUID id', async () => {
    const { user } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(user);

    const res = await PATCH(
      new Request('http://t', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'New' }),
      }),
      ctx('not-a-uuid'),
    );
    expect(res.status).toBe(400);
  });

  it('DELETE returns 204 and removes the row', async () => {
    const { user, site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(user);

    const res = await DELETE(new Request('http://t'), ctx(site.uid));
    expect(res.status).toBe(204);
    const after = await getDb().select().from(sites);
    expect(after.find((s) => s.id === site.id)).toBeUndefined();
  });

  it('DELETE returns 400 for non-UUID id', async () => {
    const { user } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(user);

    const res = await DELETE(new Request('http://t'), ctx('not-a-uuid'));
    expect(res.status).toBe(400);
  });

  it('DELETE returns 404 for non-owner (cross-tenant)', async () => {
    const { site } = await makeUserAndSite('a@a.test');
    const { user: other } = await makeUserAndSite('b@b.test');
    vi.mocked(getCurrentUser).mockResolvedValue(other);

    const res = await DELETE(new Request('http://t'), ctx(site.uid));
    expect(res.status).toBe(404);
  });
});
