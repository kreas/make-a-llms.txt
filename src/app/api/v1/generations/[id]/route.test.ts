import { describe, it, expect, vi } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { users, sites, generations, apiTokens } from '@/db/schema';
import { createApiToken } from '@/lib/tokens/api-token';

vi.mock('@vercel/blob', () => ({ get: vi.fn(async () => null) }));

import { GET } from './route';

async function seed(overrides: Partial<typeof generations.$inferInsert> = {}) {
  const db = await setupTestDb();
  const [u] = await db.insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
  const [s] = await db.insert(sites).values({
    userId: u.id, name: 'S', rootUrl: 'https://s.test',
    webhookTokenHash: 'h'.repeat(64), webhookTokenPrefix: 'lmt_aaaa',
  }).returning();
  const [g] = await db.insert(generations).values({
    siteId: s.id, userId: u.id, status: 'pending', trigger: 'manual', ...overrides,
  }).returning();
  const { token, hash, prefix } = createApiToken();
  await db.insert(apiTokens).values({ userId: u.id, name: 'CI', tokenHash: hash, tokenPrefix: prefix });
  return { gen: g, token, user: u };
}

function req(token: string, uid: string) {
  return new Request(`http://t/api/v1/generations/${uid}`, {
    headers: { authorization: `Bearer ${token}` },
  });
}

describe('GET /api/v1/generations/[uid]', () => {
  it('401 without a bearer token', async () => {
    await setupTestDb();
    const res = await GET(
      new Request('http://t/api/v1/generations/00000000-0000-4000-8000-000000000000'),
      { params: Promise.resolve({ id: '00000000-0000-4000-8000-000000000000' }) },
    );
    expect(res.status).toBe(401);
  });

  it('400 for a non-UUID path segment (enumeration attempt)', async () => {
    const { token } = await seed();
    const res = await GET(req(token, '12'), { params: Promise.resolve({ id: '12' }) });
    expect(res.status).toBe(400);
  });

  it('404 for a well-formed UUID belonging to a different user', async () => {
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
    const { token, hash, prefix } = createApiToken();
    await db.insert(apiTokens).values({ userId: u2.id, name: 'CI', tokenHash: hash, tokenPrefix: prefix });
    const res = await GET(req(token, g.uid), { params: Promise.resolve({ id: g.uid }) });
    expect(res.status).toBe(404);
  });

  it('returns curated view keyed by uid when blobs not ready', async () => {
    const { gen, token } = await seed();
    const res = await GET(req(token, gen.uid), { params: Promise.resolve({ id: gen.uid }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(gen.uid);
    expect(body.files.llms.ready).toBe(false);
    expect(body.files.llms.url).toBeUndefined();
  });

  it('includes file URLs keyed by uid when blobs are ready', async () => {
    const { gen, token } = await seed({
      status: 'succeeded',
      llmsBlobPath: 'p', llmsFullBlobPath: 'q', pagesManifestBlobPath: 'm',
    });
    const res = await GET(req(token, gen.uid), { params: Promise.resolve({ id: gen.uid }) });
    const body = await res.json();
    expect(body.files.llms.url).toBe(`http://t/api/v1/generations/${gen.uid}/llms.txt`);
    expect(body.files.pages.url).toBe(`http://t/api/v1/generations/${gen.uid}/pages`);
  });
});
