import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { users, sites, generations, apiTokens } from '@/db/schema';
import { createApiToken } from '@/lib/tokens/api-token';

vi.mock('@vercel/blob', () => ({ get: vi.fn(async () => null) }));

import { GET } from './route';

async function seed(overrides: Partial<typeof generations.$inferInsert> = {}) {
  await setupTestDb();
  const db = getDb();
  const [u] = await db.insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
  const [s] = await db
    .insert(sites)
    .values({ userId: u.id, name: 'S', rootUrl: 'https://s.test', webhookTokenHash: 'h'.repeat(64), webhookTokenPrefix: 'lmt_aaaa' })
    .returning();
  const [g] = await db
    .insert(generations)
    .values({ siteId: s.id, userId: u.id, status: 'pending', trigger: 'manual', ...overrides })
    .returning();
  const { token, hash, prefix } = createApiToken();
  await db.insert(apiTokens).values({ userId: u.id, name: 'CI', tokenHash: hash, tokenPrefix: prefix });
  return { gen: g, token };
}

function req(token: string, id: number) {
  return new Request(`http://t/api/v1/generations/${id}`, {
    headers: { authorization: `Bearer ${token}` },
  });
}

describe('GET /api/v1/generations/[id]', () => {
  it('401 without a bearer token', async () => {
    await setupTestDb();
    const res = await GET(new Request('http://t/api/v1/generations/1'), { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(401);
  });

  it('returns curated view with no file URLs when blobs not ready', async () => {
    const { gen, token } = await seed();
    const res = await GET(req(token, gen.id), { params: Promise.resolve({ id: String(gen.id) }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.files.llms.ready).toBe(false);
    expect(body.files.llms.url).toBeUndefined();
  });

  it('includes file URLs when blobs are ready', async () => {
    const { gen, token } = await seed({
      status: 'succeeded',
      llmsBlobPath: 'p',
      llmsFullBlobPath: 'q',
      pagesManifestBlobPath: 'm',
    });
    const res = await GET(req(token, gen.id), { params: Promise.resolve({ id: String(gen.id) }) });
    const body = await res.json();
    expect(body.files.llms.url).toMatch(/\/llms\.txt$/);
    expect(body.files.pages.url).toMatch(/\/pages$/);
  });
});
