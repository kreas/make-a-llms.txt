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

function ctx(id: number) {
  return { params: Promise.resolve({ id: String(id) }) };
}

describe('GET /api/v1/generations/[id]/pages.zip', () => {
  it('401 without bearer token', async () => {
    const { gen } = await seed();
    const res = await GET(new Request(`http://t/api/v1/generations/${gen.id}/pages.zip`), ctx(gen.id));
    expect(res.status).toBe(401);
  });

  it('streams a zip with correct headers', async () => {
    const { gen, token } = await seed();
    const res = await GET(
      new Request(`http://t/api/v1/generations/${gen.id}/pages.zip`, {
        headers: { authorization: `Bearer ${token}` },
      }),
      ctx(gen.id),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/zip');
    expect(res.headers.get('content-disposition')).toMatch(/attachment; filename="acme-co-pages-\d+\.zip"/);
    const buf = await res.arrayBuffer();
    expect(buf.byteLength).toBeGreaterThan(0);
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
    const res = await GET(
      new Request(`http://t/api/v1/generations/${g.id}/pages.zip`, {
        headers: { authorization: `Bearer ${token}` },
      }),
      ctx(g.id),
    );
    expect(res.status).toBe(404);
  });
});
