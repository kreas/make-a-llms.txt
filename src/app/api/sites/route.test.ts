import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { users } from '@/db/schema';

vi.mock('@/lib/auth', () => ({
  getCurrentUser: vi.fn(),
}));

import { GET, POST } from './route';
import { getCurrentUser } from '@/lib/auth';

function jsonRequest(body: any): Request {
  return new Request('http://t/api/sites', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/sites', () => {
  let userId: number;
  beforeEach(async () => {
    await setupTestDb();
    const [u] = await getDb()
      .insert(users)
      .values({ name: 'A', email: 'a@a.test' })
      .returning();
    userId = u.id;
    vi.mocked(getCurrentUser).mockResolvedValue(u);
  });

  it('creates a site and returns the one-time token', async () => {
    const res = await POST(jsonRequest({ name: 'Acme', rootUrl: 'https://acme.com' }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.site.name).toBe('Acme');
    expect(body.site.rootUrl).toBe('https://acme.com');
    expect(body.webhookToken).toMatch(/^lmt_/);
  });

  it('rejects invalid URL', async () => {
    const res = await POST(jsonRequest({ name: 'X', rootUrl: 'not-a-url' }));
    expect(res.status).toBe(400);
  });

  it('returns 409 on duplicate (userId, rootUrl)', async () => {
    await POST(jsonRequest({ name: 'Acme', rootUrl: 'https://acme.com' }));
    const res = await POST(jsonRequest({ name: 'Acme2', rootUrl: 'https://acme.com' }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe('site_exists');
  });

  it('401 when unauthenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await POST(jsonRequest({ name: 'A', rootUrl: 'https://a.test' }));
    expect(res.status).toBe(401);
  });
});

describe('GET /api/sites', () => {
  it("returns only the caller's sites", async () => {
    await setupTestDb();
    const db = getDb();
    const [u1] = await db.insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
    const [u2] = await db.insert(users).values({ name: 'B', email: 'b@b.test' }).returning();
    vi.mocked(getCurrentUser).mockResolvedValue(u1);

    await POST(jsonRequest({ name: 'Mine', rootUrl: 'https://mine.test' }));
    vi.mocked(getCurrentUser).mockResolvedValue(u2);
    await POST(jsonRequest({ name: 'Theirs', rootUrl: 'https://theirs.test' }));

    vi.mocked(getCurrentUser).mockResolvedValue(u1);
    const res = await GET();
    const body = await res.json();
    expect(body.sites).toHaveLength(1);
    expect(body.sites[0].name).toBe('Mine');
  });
});
