import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { generations, sites, users } from '@/db/schema';

vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }));
import { GET } from './route';
import { getCurrentUser } from '@/lib/auth';

const ctx = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });

describe('GET /api/generations/[id]', () => {
  it('returns the generation with download URLs once paths exist', async () => {
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

    const res = await GET(new Request('http://t'), ctx(g.id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.generation.id).toBe(g.id);
    expect(body.downloads.llms).toBe(`/api/generations/${g.id}/files/llms`);
    expect(body.downloads.llmsFull).toBeUndefined();
  });

  it('404 for non-owner', async () => {
    await setupTestDb();
    const db = getDb();
    const [u1] = await db.insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
    const [u2] = await db.insert(users).values({ name: 'B', email: 'b@b.test' }).returning();
    const [s] = await db
      .insert(sites)
      .values({
        userId: u1.id,
        name: 'S',
        rootUrl: 'https://s.test',
        webhookTokenHash: 'a'.repeat(64),
        webhookTokenPrefix: 'lmt_aaaa',
      })
      .returning();
    const [g] = await db
      .insert(generations)
      .values({ siteId: s.id, userId: u1.id, trigger: 'manual' })
      .returning();
    vi.mocked(getCurrentUser).mockResolvedValue(u2);

    const res = await GET(new Request('http://t'), ctx(g.id));
    expect(res.status).toBe(404);
  });
});
