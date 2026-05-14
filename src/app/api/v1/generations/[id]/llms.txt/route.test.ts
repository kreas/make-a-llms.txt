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
  return { gen: g, token };
}

describe('GET /api/v1/generations/[id]/llms.txt', () => {
  it('streams the blob with text/plain', async () => {
    const { gen, token } = await seed(true);
    const r = new Request('http://t', { headers: { authorization: `Bearer ${token}` } });
    const res = await GET(r, { params: Promise.resolve({ id: String(gen.id) }) });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/plain/);
    expect(await res.text()).toBe('llms body');
  });

  it('404 not_ready when blob path is null', async () => {
    const { gen, token } = await seed(false);
    const r = new Request('http://t', { headers: { authorization: `Bearer ${token}` } });
    const res = await GET(r, { params: Promise.resolve({ id: String(gen.id) }) });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('not_ready');
  });
});
