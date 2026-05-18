import { describe, it, expect, vi } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { users, sites, generations, apiTokens } from '@/db/schema';
import { createApiToken } from '@/lib/tokens/api-token';

vi.mock('@vercel/blob', () => ({
  get: vi.fn(async (p: string) => {
    if (p === 'M') {
      return {
        stream: new Response(
          JSON.stringify({ pages: [{ path: 'about', blobPath: 'pages/about.md', status: 'ok' }] }),
        ).body,
      };
    }
    if (p === 'pages/about.md') {
      return { stream: new Response('# About').body };
    }
    return null;
  }),
}));

import { GET } from './route';

async function seed() {
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
      siteId: s.id, userId: u.id, status: 'succeeded', trigger: 'manual',
      pagesManifestBlobPath: 'M', pagesCount: 1, pagesStatus: 'succeeded',
    })
    .returning();
  const { token, hash, prefix } = createApiToken();
  await db.insert(apiTokens).values({ userId: u.id, name: 'CI', tokenHash: hash, tokenPrefix: prefix });
  return { gen: g, token };
}

describe('GET /api/v1/generations/[id]/pages/[...path]', () => {
  it('streams the page markdown', async () => {
    const { gen, token } = await seed();
    const r = new Request('http://t', { headers: { authorization: `Bearer ${token}` } });
    const res = await GET(r, { params: Promise.resolve({ id: gen.uid, path: ['about'] }) });
    expect(res.headers.get('content-type')).toMatch(/text\/markdown/);
    expect(await res.text()).toBe('# About');
  });

  it('404 when the page is not in the manifest', async () => {
    const { gen, token } = await seed();
    const r = new Request('http://t', { headers: { authorization: `Bearer ${token}` } });
    const res = await GET(r, { params: Promise.resolve({ id: gen.uid, path: ['missing'] }) });
    expect(res.status).toBe(404);
  });

  it('400 for non-UUID id', async () => {
    const { token } = await seed();
    const r = new Request('http://t', { headers: { authorization: `Bearer ${token}` } });
    const res = await GET(r, { params: Promise.resolve({ id: 'not-uuid', path: ['about'] }) });
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
      .values({ siteId: s.id, userId: other.id, status: 'succeeded', trigger: 'manual', pagesManifestBlobPath: 'M' })
      .returning();
    const r = new Request('http://t', { headers: { authorization: `Bearer ${token}` } });
    const res = await GET(r, { params: Promise.resolve({ id: g.uid, path: ['about'] }) });
    expect(res.status).toBe(404);
  });
});
