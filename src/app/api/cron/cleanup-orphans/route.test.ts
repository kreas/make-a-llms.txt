import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { eq } from 'drizzle-orm';
import { generations, sites, users } from '@/db/schema';

const delSpy = vi.fn(async () => {});
const listSpy = vi.fn(async () => ({ blobs: [] as { pathname: string }[] }));
vi.mock('@/lib/blob', () => ({
  del: (...a: any[]) => delSpy(...a),
  list: (...a: any[]) => listSpy(...a),
}));

import { GET } from './route';

describe('cleanup orphans cron', () => {
  beforeEach(() => {
    delSpy.mockClear();
    listSpy.mockClear();
    process.env.CRON_SECRET = 'test-secret';
  });

  it('401 without bearer', async () => {
    const res = await GET(new Request('http://t/api/cron/cleanup-orphans'));
    expect(res.status).toBe(401);
  });

  it('deletes blobs for cancelled/failed older than 1h', async () => {
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
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    await db.insert(generations).values({
      siteId: s.id,
      userId: u.id,
      trigger: 'manual',
      status: 'cancelled',
      llmsBlobPath: 'gens/1/llms.txt',
      llmsFullBlobPath: 'gens/1/llms-full.txt',
      createdAt: old,
      updatedAt: old,
    });

    const res = await GET(
      new Request('http://t/api/cron/cleanup-orphans', {
        headers: { authorization: 'Bearer test-secret' },
      }),
    );
    expect(res.status).toBe(200);
    expect(delSpy).toHaveBeenCalledTimes(2);
  });

  it('deletes page blobs and manifest for orphaned generation', async () => {
    await setupTestDb();
    const db = getDb();
    const [u] = await db.insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
    const [s] = await db
      .insert(sites)
      .values({ userId: u.id, name: 'S', rootUrl: 'https://s.test', webhookTokenHash: 'a'.repeat(64), webhookTokenPrefix: 'lmt_aaaa' })
      .returning();
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    await db.insert(generations).values({
      siteId: s.id,
      userId: u.id,
      trigger: 'manual',
      status: 'cancelled',
      pagesStatus: 'cancelled',
      pagesManifestBlobPath: 'gens/1/pages-manifest.json',
      createdAt: old,
      updatedAt: old,
    });

    listSpy.mockResolvedValueOnce({
      blobs: [
        { pathname: 'gens/1/pages/a.md' },
        { pathname: 'gens/1/pages/b.md' },
      ],
    });

    const res = await GET(
      new Request('http://t/api/cron/cleanup-orphans', {
        headers: { authorization: 'Bearer test-secret' },
      }),
    );
    expect(res.status).toBe(200);
    const calls = delSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(calls).toMatch(/pages\/a\.md/);
    expect(calls).toMatch(/pages\/b\.md/);
    expect(calls).toMatch(/pages-manifest\.json/);
  });

  it('deletes page blobs and manifest for orphaned generation using UUID paths', async () => {
    await setupTestDb();
    const db = getDb();
    const [u] = await db.insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
    const [s] = await db
      .insert(sites)
      .values({ userId: u.id, name: 'S', rootUrl: 'https://s.test', webhookTokenHash: 'a'.repeat(64), webhookTokenPrefix: 'lmt_aaaa' })
      .returning();
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const [g] = await db.insert(generations).values({
      siteId: s.id,
      userId: u.id,
      trigger: 'manual',
      status: 'cancelled',
      pagesStatus: 'cancelled',
      pagesManifestBlobPath: `projects/${s.uid}/${s.id}/pages-manifest.json`,
      createdAt: old,
      updatedAt: old,
    }).returning();

    // Update with actual g.uid
    await db.update(generations).set({
      pagesManifestBlobPath: `projects/${s.uid}/${g.uid}/pages-manifest.json`,
    }).where(eq(generations.id, g.id));

    listSpy.mockResolvedValueOnce({
      blobs: [
        { pathname: `projects/${s.uid}/${g.uid}/pages/a.md` },
        { pathname: `projects/${s.uid}/${g.uid}/pages/b.md` },
      ],
    });

    const res = await GET(
      new Request('http://t/api/cron/cleanup-orphans', {
        headers: { authorization: 'Bearer test-secret' },
      }),
    );
    expect(res.status).toBe(200);
    const calls = delSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(calls).toContain(`projects/${s.uid}/${g.uid}/pages/a.md`);
    expect(calls).toContain(`projects/${s.uid}/${g.uid}/pages/b.md`);
    expect(calls).toContain(`projects/${s.uid}/${g.uid}/pages-manifest.json`);
    expect(listSpy).toHaveBeenCalledWith({ prefix: `projects/${s.uid}/${g.uid}/pages/` });
  });
});
