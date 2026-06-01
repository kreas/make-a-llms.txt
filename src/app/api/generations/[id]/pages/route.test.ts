import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { generations, sites, users } from '@/db/schema';
import { eq } from 'drizzle-orm';

const getBlobSpy = vi.fn();
vi.mock('@/lib/blob', () => ({ get: (...a: any[]) => getBlobSpy(...a) }));
vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }));

import { GET } from './route';
import { getCurrentUser } from '@/lib/auth';

async function seed() {
  await setupTestDb();
  const db = getDb();
  const [u] = await db.insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
  const [s] = await db
    .insert(sites)
    .values({
      userId: u.id,
      name: 'S',
      rootUrl: 'https://x.test',
      webhookTokenHash: 'a'.repeat(64),
      webhookTokenPrefix: 'lmt_aaaa',
    })
    .returning();
  const [g] = await db
    .insert(generations)
    .values({ siteId: s.id, userId: u.id, trigger: 'manual' })
    .returning();
  return { u, s, g };
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe('GET /api/generations/[id]/pages', () => {
  beforeEach(() => {
    getBlobSpy.mockReset();
    vi.mocked(getCurrentUser).mockReset();
  });

  it('401 when unauthenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await GET(new Request('http://t'), ctx('00000000-0000-0000-0000-000000000000'));
    expect(res.status).toBe(401);
  });

  it('400 for non-uuid id', async () => {
    await setupTestDb();
    const db = getDb();
    const [u] = await db.insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
    vi.mocked(getCurrentUser).mockResolvedValue(u);
    const res = await GET(new Request('http://t'), ctx('not-a-uuid'));
    expect(res.status).toBe(400);
  });

  it('404 for non-owner', async () => {
    const { g } = await seed();
    const db = getDb();
    const [other] = await db.insert(users).values({ name: 'B', email: 'b@b.test' }).returning();
    vi.mocked(getCurrentUser).mockResolvedValue(other);
    const res = await GET(new Request('http://t'), ctx(g.uid));
    expect(res.status).toBe(404);
  });

  it('returns the pending shape when no manifest is written yet', async () => {
    const { u, g } = await seed();
    vi.mocked(getCurrentUser).mockResolvedValue(u);
    const res = await GET(new Request('http://t'), ctx(g.uid));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ status: 'pending', pages: [] });
  });

  it('returns the parsed manifest when written', async () => {
    const { u, g } = await seed();
    vi.mocked(getCurrentUser).mockResolvedValue(u);
    await getDb()
      .update(generations)
      .set({
        pagesStatus: 'succeeded',
        pagesCount: 1,
        pagesManifestBlobPath: `gens/${g.id}/pages-manifest.json`,
      })
      .where(eq(generations.id, g.id));
    getBlobSpy.mockResolvedValueOnce({
      stream: new Response(JSON.stringify({ version: 1, pages: [{ url: 'x' }] })).body,
    });
    const res = await GET(new Request('http://t'), ctx(g.uid));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('succeeded');
    expect(body.pages).toHaveLength(1);
  });
});
