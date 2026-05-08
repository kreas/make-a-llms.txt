import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { generations, sites, users } from '@/db/schema';

const delSpy = vi.fn(async () => {});
vi.mock('@vercel/blob', () => ({ del: (...a: any[]) => delSpy(...a) }));

import { GET } from './route';

describe('cleanup orphans cron', () => {
  beforeEach(() => {
    delSpy.mockClear();
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
});
