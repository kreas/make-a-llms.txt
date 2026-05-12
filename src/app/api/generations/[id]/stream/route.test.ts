import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { generations, sites, users } from '@/db/schema';
import { eq } from 'drizzle-orm';

vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }));
import { buildEventStream } from './route';
import { getCurrentUser } from '@/lib/auth';

describe('SSE stream builder', () => {
  it('emits a status event when row changes and closes on terminal', async () => {
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
      .values({ siteId: s.id, userId: u.id, trigger: 'manual', status: 'pending' })
      .returning();
    vi.mocked(getCurrentUser).mockResolvedValue(u);

    const events: string[] = [];
    const fakeWriter = { write: (s: string) => events.push(s), close: vi.fn() };

    const loop = buildEventStream(g.id, u.id, fakeWriter as any, {
      intervalMs: 5,
      heartbeatMs: 1000,
      idleTimeoutMs: 1000,
    });

    await new Promise((r) => setTimeout(r, 20));
    await db.update(generations).set({ status: 'running' }).where(eq(generations.id, g.id));
    await new Promise((r) => setTimeout(r, 20));
    await db.update(generations).set({ status: 'succeeded' }).where(eq(generations.id, g.id));

    await loop;

    const body = events.join('');
    expect(body).toMatch(/status/);
    expect(body).toMatch(/succeeded/);
    expect(fakeWriter.close).toHaveBeenCalled();
  });

  it('snapshot includes pages fields', async () => {
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
    // status='succeeded' so buildEventStream exits after one tick.
    const [g] = await db
      .insert(generations)
      .values({
        siteId: s.id,
        userId: u.id,
        trigger: 'manual',
        status: 'succeeded',
        pagesStatus: 'running',
        pagesCount: 3,
      })
      .returning();

    const writes: string[] = [];
    await buildEventStream(
      g.id,
      u.id,
      { write: (str) => writes.push(str), close: () => {} },
      { intervalMs: 1, heartbeatMs: 60_000, idleTimeoutMs: 60_000 },
    );

    const statusFrame = writes.find((w) => w.startsWith('event: status'));
    expect(statusFrame).toBeDefined();
    const payload = JSON.parse(statusFrame!.split('data: ')[1].trim());
    expect(payload.pagesStatus).toBe('running');
    expect(payload.pagesCount).toBe(3);
    expect(payload).toHaveProperty('pagesManifestBlobPath');
    expect(payload).toHaveProperty('pagesErrorMessage');
  });
});
