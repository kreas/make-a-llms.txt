import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { generations, sites, users } from '@/db/schema';

vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }));

import { POST } from './route';
import { getCurrentUser } from '@/lib/auth';

const ctx = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });

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

    const res = await POST(new Request('http://t', { method: 'POST' }), ctx(g.id));
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

    const res = await POST(new Request('http://t', { method: 'POST' }), ctx(g.id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.generation.status).toBe('succeeded');
  });
});
