import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { generations, sites, users } from '@/db/schema';

const getBlobSpy = vi.fn();
vi.mock('@vercel/blob', () => ({ get: (...a: any[]) => getBlobSpy(...a) }));
vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }));

import { GET } from './route';
import { getCurrentUser } from '@/lib/auth';

async function seed(pages: { path: string; blobPath: string; status: 'ok' | 'failed' }[]) {
  await setupTestDb();
  const db = getDb();
  const [u] = await db.insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
  const [s] = await db
    .insert(sites)
    .values({ userId: u.id, name: 'Acme', rootUrl: 'https://x.test', webhookTokenHash: 'a'.repeat(64), webhookTokenPrefix: 'lmt_aaaa' })
    .returning();
  const [g] = await db
    .insert(generations)
    .values({
      siteId: s.id,
      userId: u.id,
      trigger: 'manual',
      pagesStatus: 'succeeded',
      pagesManifestBlobPath: `gens/x/pages-manifest.json`,
    })
    .returning();

  getBlobSpy.mockImplementation(async (p: string) => {
    if (p === `gens/x/pages-manifest.json`) {
      return { stream: new Response(JSON.stringify({ pages })).body };
    }
    return { stream: new Response('# hi').body };
  });
  return { u, g };
}

describe('GET /api/generations/[id]/pages.zip', () => {
  beforeEach(() => {
    getBlobSpy.mockReset();
    vi.mocked(getCurrentUser).mockReset();
  });

  it('streams a zip with correct headers', async () => {
    const { u, g } = await seed([
      { path: 'a', blobPath: 'gens/x/pages/a.md', status: 'ok' },
      { path: 'b', blobPath: 'gens/x/pages/b.md', status: 'failed' },
    ]);
    vi.mocked(getCurrentUser).mockResolvedValue(u);
    const res = await GET(new Request('http://t'), {
      params: Promise.resolve({ id: String(g.id) }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/zip');
    expect(res.headers.get('content-disposition')).toMatch(/attachment;.*\.zip/);
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.length).toBeGreaterThan(0);
    expect(buf.slice(0, 2).toString('binary')).toBe('PK'); // zip magic bytes
  });

  it('404 for non-owner', async () => {
    const { g } = await seed([{ path: 'a', blobPath: 'gens/x/pages/a.md', status: 'ok' }]);
    const db = getDb();
    const [other] = await db.insert(users).values({ name: 'B', email: 'b@b.test' }).returning();
    vi.mocked(getCurrentUser).mockResolvedValue(other);
    const res = await GET(new Request('http://t'), { params: Promise.resolve({ id: String(g.id) }) });
    expect(res.status).toBe(404);
  });
});
