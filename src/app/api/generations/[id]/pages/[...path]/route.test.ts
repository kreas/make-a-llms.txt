import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { generations, sites, users } from '@/db/schema';

const getBlobSpy = vi.fn();
vi.mock('@vercel/blob', () => ({ get: (...a: any[]) => getBlobSpy(...a) }));
vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }));

import { GET } from './route';
import { getCurrentUser } from '@/lib/auth';

async function seedWithManifest(pages: { path: string; blobPath: string; status: 'ok' | 'failed' | 'skipped' }[]) {
  await setupTestDb();
  const db = getDb();
  const [u] = await db.insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
  const [s] = await db
    .insert(sites)
    .values({ userId: u.id, name: 'S', rootUrl: 'https://x.test', webhookTokenHash: 'a'.repeat(64), webhookTokenPrefix: 'lmt_aaaa' })
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
      return {
        stream: new Response(JSON.stringify({ pages: pages.map((pg) => ({ ...pg, status: pg.status })) })).body,
      };
    }
    if (pages.some((pg) => pg.blobPath === p && pg.status === 'ok')) {
      return { stream: new Response('# Hello').body };
    }
    return null;
  });
  return { u, g };
}

describe('GET /api/generations/[id]/pages/[...path]', () => {
  beforeEach(() => {
    getBlobSpy.mockReset();
    vi.mocked(getCurrentUser).mockReset();
  });

  it('streams markdown for an allowed path', async () => {
    const { u, g } = await seedWithManifest([
      { path: 'docs/cdn', blobPath: 'gens/x/pages/docs/cdn.md', status: 'ok' },
    ]);
    vi.mocked(getCurrentUser).mockResolvedValue(u);
    const res = await GET(new Request('http://t'), {
      params: Promise.resolve({ id: String(g.id), path: ['docs', 'cdn'] }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/markdown/);
    const body = await res.text();
    expect(body).toBe('# Hello');
  });

  it('404 for a path not in the manifest', async () => {
    const { u, g } = await seedWithManifest([
      { path: 'docs/cdn', blobPath: 'gens/x/pages/docs/cdn.md', status: 'ok' },
    ]);
    vi.mocked(getCurrentUser).mockResolvedValue(u);
    const res = await GET(new Request('http://t'), {
      params: Promise.resolve({ id: String(g.id), path: ['evil'] }),
    });
    expect(res.status).toBe(404);
  });

  it('404 for non-owner', async () => {
    const { g } = await seedWithManifest([
      { path: 'docs/cdn', blobPath: 'gens/x/pages/docs/cdn.md', status: 'ok' },
    ]);
    const db = getDb();
    const [other] = await db.insert(users).values({ name: 'B', email: 'b@b.test' }).returning();
    vi.mocked(getCurrentUser).mockResolvedValue(other);
    const res = await GET(new Request('http://t'), {
      params: Promise.resolve({ id: String(g.id), path: ['docs', 'cdn'] }),
    });
    expect(res.status).toBe(404);
  });
});
