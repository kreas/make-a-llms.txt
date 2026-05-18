import { describe, it, expect, vi } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { generations, sites, users } from '@/db/schema';

vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }));

import { POST } from './route';
import { getCurrentUser } from '@/lib/auth';

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe('POST /api/generations/[id]/cancel', () => {
  it('cancels a running generation', async () => {
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
        status: 'running',
        workflowRunId: 'wf-1',
      })
      .returning();
    vi.mocked(getCurrentUser).mockResolvedValue(u);

    const res = await POST(new Request('http://t', { method: 'POST' }), ctx(g.uid));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.generation.status).toBe('cancelled');
  });

  it('idempotent on terminal generation', async () => {
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
      .values({ siteId: s.id, userId: u.id, trigger: 'manual', status: 'succeeded' })
      .returning();
    vi.mocked(getCurrentUser).mockResolvedValue(u);

    const res = await POST(new Request('http://t', { method: 'POST' }), ctx(g.uid));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.generation.status).toBe('succeeded');
  });

  it('400 for non-uuid id', async () => {
    await setupTestDb();
    const db = getDb();
    const [u] = await db.insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
    vi.mocked(getCurrentUser).mockResolvedValue(u);
    const res = await POST(new Request('http://t', { method: 'POST' }), ctx('not-a-uuid'));
    expect(res.status).toBe(400);
  });

  it('404 for non-owner (cross-tenant)', async () => {
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
      .values({ siteId: s.id, userId: u1.id, trigger: 'manual', status: 'running' })
      .returning();
    vi.mocked(getCurrentUser).mockResolvedValue(u2);

    const res = await POST(new Request('http://t', { method: 'POST' }), ctx(g.uid));
    expect(res.status).toBe(404);
  });
});
