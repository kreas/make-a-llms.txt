import { describe, it, expect, vi } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { users, sites, generations } from '@/db/schema';

vi.mock('@/lib/blob', () => ({
  get: vi.fn(async (path: string) => {
    if (path === 'pages/manifest.json') {
      return { stream: new Response(JSON.stringify({ pages: [{ url: 'https://example.com/a', path: 'a', blobPath: 'pages/a.md', status: 'ok', bytes: 10 }] })).body };
    }
    if (path === 'pages/a.md') {
      return { stream: new Response('# A').body };
    }
    if (path === 'llms.txt') {
      return { stream: new Response('llms here').body };
    }
    return null;
  }),
}));

import { getGenerationView, readGenerationFile, readPageManifest, readPageMarkdown } from './generations';

async function seed() {
  await setupTestDb();
  const db = getDb();
  const [u] = await db.insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
  const [s] = await db
    .insert(sites)
    .values({ userId: u.id, name: 'S', rootUrl: 'https://s.test', webhookTokenHash: 'h'.repeat(64), webhookTokenPrefix: 'lmt_aaaa' })
    .returning();
  const [g] = await db
    .insert(generations)
    .values({
      siteId: s.id,
      userId: u.id,
      status: 'succeeded',
      trigger: 'manual',
      pagesManifestBlobPath: 'pages/manifest.json',
      llmsBlobPath: 'llms.txt',
      pagesCount: 1,
      pagesStatus: 'succeeded',
      summariesStatus: 'succeeded',
      summariesCount: 1,
    })
    .returning();
  return { user: u, gen: g };
}

describe('getGenerationView', () => {
  it('returns a curated view with file readiness flags', async () => {
    const { user, gen } = await seed();
    const v = await getGenerationView(gen.uid, user.id);
    expect(v.status).toBe('succeeded');
    expect(v.files.llms.ready).toBe(true);
    expect(v.files.llmsFull.ready).toBe(false);
    expect(v.files.pages.ready).toBe(true);
    expect(v.pages.count).toBe(1);
  });

  it('throws 404 when generation is not owned', async () => {
    const { gen } = await seed();
    await expect(getGenerationView(gen.uid, 9999)).rejects.toMatchObject({ status: 404 });
  });

  it('cross-tenant: throws 404 when another user owns the generation', async () => {
    const db = await setupTestDb();
    const [u1] = await db.insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
    const [u2] = await db.insert(users).values({ name: 'B', email: 'b@b.test' }).returning();
    const [s] = await db.insert(sites).values({
      userId: u1.id, name: 'S', rootUrl: 'https://s.test',
      webhookTokenHash: 'h'.repeat(64), webhookTokenPrefix: 'lmt_aaaa',
    }).returning();
    const [g] = await db.insert(generations).values({
      siteId: s.id, userId: u1.id, status: 'pending', trigger: 'manual',
    }).returning();
    await expect(getGenerationView(g.uid, u2.id)).rejects.toMatchObject({ status: 404 });
  });
});

describe('readGenerationFile', () => {
  it('returns a stream and filename for llms', async () => {
    const { user, gen } = await seed();
    const r = await readGenerationFile(gen.uid, user.id, 'llms');
    expect(r.filename).toBe('llms.txt');
    expect(await new Response(r.stream).text()).toBe('llms here');
  });

  it('throws 404 not_ready when blob path is missing', async () => {
    const { user, gen } = await seed();
    await expect(readGenerationFile(gen.uid, user.id, 'llms-full')).rejects.toMatchObject({
      status: 404,
      code: 'not_ready',
    });
  });
});

describe('readPageManifest / readPageMarkdown', () => {
  it('returns the manifest pages', async () => {
    const { user, gen } = await seed();
    const m = await readPageManifest(gen.uid, user.id);
    expect(m.pages[0].path).toBe('a');
  });

  it('returns markdown for a page in the manifest', async () => {
    const { user, gen } = await seed();
    const s = await readPageMarkdown(gen.uid, user.id, 'a');
    expect(await new Response(s).text()).toBe('# A');
  });

  it('throws 404 when the page is not in the manifest', async () => {
    const { user, gen } = await seed();
    await expect(readPageMarkdown(gen.uid, user.id, 'missing')).rejects.toMatchObject({
      status: 404,
    });
  });
});
