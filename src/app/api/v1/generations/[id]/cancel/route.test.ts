import { describe, it, expect, vi } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { users, sites, generations, apiTokens } from '@/db/schema';
import { createApiToken } from '@/lib/tokens/api-token';

vi.mock('@/lib/workflow/wdk', () => ({ cancelRun: vi.fn(async () => {}) }));

import { POST } from './route';

async function seed(status: 'pending' | 'running' | 'succeeded' = 'running') {
  await setupTestDb();
  const db = getDb();
  const [u] = await db.insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
  const [s] = await db
    .insert(sites)
    .values({
      userId: u.id,
      name: 'S',
      rootUrl: 'https://s.test',
      webhookTokenHash: 'h'.repeat(64),
      webhookTokenPrefix: 'lmt_aaaa',
    })
    .returning();
  const [g] = await db
    .insert(generations)
    .values({
      siteId: s.id,
      userId: u.id,
      status,
      trigger: 'manual',
      workflowRunId: 'wf-1',
    })
    .returning();
  const { token, hash, prefix } = createApiToken();
  await db.insert(apiTokens).values({ userId: u.id, name: 'CI', tokenHash: hash, tokenPrefix: prefix });
  return { user: u, gen: g, token };
}

function ctx(id: number) {
  return { params: Promise.resolve({ id: String(id) }) };
}

describe('POST /api/v1/generations/[id]/cancel', () => {
  it('401 without bearer token', async () => {
    const { gen } = await seed();
    const res = await POST(new Request(`http://t/api/v1/generations/${gen.id}/cancel`, { method: 'POST' }), ctx(gen.id));
    expect(res.status).toBe(401);
  });

  it('cancels a running generation and returns it', async () => {
    const { gen, token } = await seed('running');
    const res = await POST(
      new Request(`http://t/api/v1/generations/${gen.id}/cancel`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
      }),
      ctx(gen.id),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.generation.status).toBe('cancelled');
    expect(body.generation.completedAt).toBeTruthy();
  });

  it('is idempotent for terminal generations', async () => {
    const { gen, token } = await seed('succeeded');
    const res = await POST(
      new Request(`http://t/api/v1/generations/${gen.id}/cancel`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
      }),
      ctx(gen.id),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.generation.status).toBe('succeeded');
  });

  it('404 for a generation not owned by the caller', async () => {
    const { token } = await seed();
    const db = getDb();
    const [other] = await db.insert(users).values({ name: 'O', email: 'o@o.test' }).returning();
    const [s] = await db
      .insert(sites)
      .values({
        userId: other.id,
        name: 'X',
        rootUrl: 'https://x.test',
        webhookTokenHash: 'g'.repeat(64),
        webhookTokenPrefix: 'lmt_bbbb',
      })
      .returning();
    const [g] = await db
      .insert(generations)
      .values({ siteId: s.id, userId: other.id, status: 'running', trigger: 'manual' })
      .returning();
    const res = await POST(
      new Request(`http://t/api/v1/generations/${g.id}/cancel`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
      }),
      ctx(g.id),
    );
    expect(res.status).toBe(404);
  });
});
