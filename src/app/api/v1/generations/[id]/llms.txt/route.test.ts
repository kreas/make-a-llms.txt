import { describe, it, expect, vi } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { users, sites, generations, apiTokens } from '@/db/schema';
import { createApiToken } from '@/lib/tokens/api-token';

vi.mock('@vercel/blob', () => ({
  get: vi.fn(async (path: string) =>
    path === 'L' ? { stream: new Response('llms body').body } : null,
  ),
}));

import { GET } from './route';

async function seed(withBlob = true) {
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
      llmsBlobPath: withBlob ? 'L' : null,
    })
    .returning();
  const { token, hash, prefix } = createApiToken();
  await db.insert(apiTokens).values({ userId: u.id, name: 'CI', tokenHash: hash, tokenPrefix: prefix });
  return { gen: g, token, user: u };
}

function req(token: string, id: string) {
  return new Request(`http://t/api/v1/generations/${id}/llms.txt`, { headers: { authorization: `Bearer ${token}` } });
}

describe('GET /api/v1/generations/[id]/llms.txt', () => {
  it('streams the blob with text/plain', async () => {
    const { gen, token } = await seed(true);
    const res = await GET(req(token, gen.uid), { params: Promise.resolve({ id: gen.uid }) });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/plain/);
    expect(await res.text()).toBe('llms body');
  });

  it('404 not_ready when blob path is null', async () => {
    const { gen, token } = await seed(false);
    const res = await GET(req(token, gen.uid), { params: Promise.resolve({ id: gen.uid }) });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('not_ready');
  });

  it('400 for a non-UUID path segment', async () => {
    const { token } = await seed();
    const res = await GET(req(token, 'not-uuid'), { params: Promise.resolve({ id: 'not-uuid' }) });
    expect(res.status).toBe(400);
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
      .values({ siteId: s.id, userId: other.id, status: 'succeeded', trigger: 'manual', llmsBlobPath: 'L' })
      .returning();
    const res = await GET(req(token, g.uid), { params: Promise.resolve({ id: g.uid }) });
    expect(res.status).toBe(404);
  });
});
