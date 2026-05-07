import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { generations, sites, users } from '@/db/schema';

vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@vercel/blob', () => ({
  head: vi.fn(async (url: string) => ({ url, pathname: url.split('/').pop()!, size: 5 })),
}));
const fetchSpy = vi.fn();
vi.stubGlobal('fetch', fetchSpy);

import { GET } from './route';
import { getCurrentUser } from '@/lib/auth';

const ctx = (id: number, kind: string) => ({
  params: Promise.resolve({ id: String(id), kind }),
});

describe('GET file proxy', () => {
  beforeEach(() => {
    fetchSpy.mockReset();
    fetchSpy.mockResolvedValue(
      new Response('hello', { status: 200, headers: { 'content-type': 'text/plain' } }),
    );
  });

  it('streams the blob for owner', async () => {
    await setupTestDb();
    const db = getDb();
    const [u] = await db.insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
    const [s] = await db
      .insert(sites)
      .values({
        userId: u.id,
        name: 'S',
        rootUrl: 'https://s.test',
        webhookTokenHash: 'a'.repeat(64),
        webhookTokenPrefix: 'lmt_aaaa',
      })
      .returning();
    const [g] = await db
      .insert(generations)
      .values({
        siteId: s.id,
        userId: u.id,
        trigger: 'manual',
        llmsBlobPath: 'gens/1/llms.txt',
      })
      .returning();
    vi.mocked(getCurrentUser).mockResolvedValue(u);

    const res = await GET(new Request('http://t'), ctx(g.id, 'llms'));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('hello');
  });

  it('404 when path is missing', async () => {
    await setupTestDb();
    const db = getDb();
    const [u] = await db.insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
    const [s] = await db
      .insert(sites)
      .values({
        userId: u.id,
        name: 'S',
        rootUrl: 'https://s.test',
        webhookTokenHash: 'a'.repeat(64),
        webhookTokenPrefix: 'lmt_aaaa',
      })
      .returning();
    const [g] = await db
      .insert(generations)
      .values({ siteId: s.id, userId: u.id, trigger: 'manual' })
      .returning();
    vi.mocked(getCurrentUser).mockResolvedValue(u);

    const res = await GET(new Request('http://t'), ctx(g.id, 'llms'));
    expect(res.status).toBe(404);
  });

  it('400 on invalid kind', async () => {
    const res = await GET(new Request('http://t'), ctx(1, 'bogus'));
    expect(res.status).toBe(400);
  });
});
