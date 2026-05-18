import { describe, it, expect, vi } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { users, sites, generations, apiTokens } from '@/db/schema';
import { createApiToken } from '@/lib/tokens/api-token';

vi.mock('@vercel/blob', () => {
  const manifest = {
    pages: [
      { path: 'about', filename: 'about.md', blobPath: 'pages/about.md', status: 'ok' },
    ],
  };
  return {
    get: vi.fn(async (path: string) => {
      if (path === 'M') {
        return {
          stream: new Response(JSON.stringify(manifest)).body,
        };
      }
      if (path === 'pages/about.md') {
        return { stream: new Response('# About\n').body };
      }
      return null;
    }),
  };
});

import { GET } from './route';

async function seed() {
  await setupTestDb();
  const db = getDb();
  const [u] = await db.insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
  const [s] = await db
    .insert(sites)
    .values({
      userId: u.id,
      name: 'Acme Co',
      rootUrl: 'https://acme.test',
      webhookTokenHash: 'h'.repeat(64),
      webhookTokenPrefix: 'lmt_aaaa',
    })
    .returning();
  const [g] = await db
    .insert(generations)
    .values({
      siteId: s.id,
      userId: u.id,
      status: 'succeeded',
      trigger: 'manual',
      pagesManifestBlobPath: 'M',
      pagesCount: 1,
      pagesStatus: 'succeeded',
    })
    .returning();
  const { token, hash, prefix } = createApiToken();
  await db.insert(apiTokens).values({ userId: u.id, name: 'CI', tokenHash: hash, tokenPrefix: prefix });
  return { gen: g, token };
}

function req(token: string, id: string) {
  return new Request(`http://t/api/v1/generations/${id}/pages.zip`, {
    headers: { authorization: `Bearer ${token}` },
  });
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('GET /api/v1/generations/[id]/pages.zip', () => {
  it('401 without bearer token', async () => {
    const { gen } = await seed();
    const res = await GET(new Request(`http://t/api/v1/generations/${gen.uid}/pages.zip`), ctx(gen.uid));
    expect(res.status).toBe(401);
  });

  it('streams a zip with correct headers', async () => {
    const { gen, token } = await seed();
    const res = await GET(req(token, gen.uid), ctx(gen.uid));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/zip');
    expect(res.headers.get('content-disposition')).toMatch(/attachment; filename="acme-co-pages-[0-9a-f-]+\.zip"/);
    const buf = await res.arrayBuffer();
    expect(buf.byteLength).toBeGreaterThan(0);
  });

  it('400 for non-UUID id', async () => {
    const { token } = await seed();
    const res = await GET(req(token, 'not-uuid'), ctx('not-uuid'));
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
    const res = await GET(req(token, g.uid), ctx(g.uid));
    expect(res.status).toBe(404);
  });

  it('404 when no manifest blob is set', async () => {
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
      .values({ siteId: s.id, userId: u.id, status: 'pending', trigger: 'manual' })
      .returning();
    const { token, hash, prefix } = createApiToken();
    await db.insert(apiTokens).values({ userId: u.id, name: 'CI', tokenHash: hash, tokenPrefix: prefix });
    const res = await GET(req(token, g.uid), ctx(g.uid));
    expect(res.status).toBe(404);
  });
});
