import { describe, it, expect, beforeEach } from 'vitest';
import { setupTestDb } from '@/test/db';
import { sites, users, apiTokens, generations } from '@/db/schema';
import { getDb } from '@/db';
import {
  assertOwnsSiteByUid,
  assertOwnsGenerationByUid,
  ApiError,
  requireApiTokenOrThrow,
} from './auth-guards';
import { createApiToken } from '@/lib/tokens/api-token';
import { eq } from 'drizzle-orm';

describe('auth-guards', () => {
  it('ApiError carries status and code', () => {
    const e = new ApiError(401, 'unauthenticated', 'Sign in required');
    expect(e.status).toBe(401);
    expect(e.code).toBe('unauthenticated');
    expect(e.message).toBe('Sign in required');
  });
});

describe('assertOwnsSiteByUid', () => {
  it('returns the site when the user owns it', async () => {
    const db = await setupTestDb();
    const [u] = await db.insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
    const [s] = await db.insert(sites).values({
      userId: u.id, name: 'S', rootUrl: 'https://s.test',
      webhookTokenHash: 'h'.repeat(64), webhookTokenPrefix: 'lmt_aaaa',
    }).returning();
    const got = await assertOwnsSiteByUid(s.uid, u.id);
    expect(got.id).toBe(s.id);
  });

  it('throws ApiError(404) when another user owns the site', async () => {
    const db = await setupTestDb();
    const [u1] = await db.insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
    const [u2] = await db.insert(users).values({ name: 'B', email: 'b@b.test' }).returning();
    const [s] = await db.insert(sites).values({
      userId: u1.id, name: 'S', rootUrl: 'https://s.test',
      webhookTokenHash: 'h'.repeat(64), webhookTokenPrefix: 'lmt_aaaa',
    }).returning();
    await expect(assertOwnsSiteByUid(s.uid, u2.id)).rejects.toMatchObject({ status: 404 });
  });

  it('throws ApiError(404) for an unknown uid', async () => {
    const db = await setupTestDb();
    const [u] = await db.insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
    await expect(
      assertOwnsSiteByUid('00000000-0000-4000-8000-000000000000', u.id),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('assertOwnsGenerationByUid', () => {
  it('returns the generation when the user owns it', async () => {
    const db = await setupTestDb();
    const [u] = await db.insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
    const [s] = await db.insert(sites).values({
      userId: u.id, name: 'S', rootUrl: 'https://s.test',
      webhookTokenHash: 'h'.repeat(64), webhookTokenPrefix: 'lmt_aaaa',
    }).returning();
    const [g] = await db.insert(generations).values({
      siteId: s.id, userId: u.id, status: 'pending', trigger: 'manual',
    }).returning();
    const got = await assertOwnsGenerationByUid(g.uid, u.id);
    expect(got.id).toBe(g.id);
  });

  it('throws ApiError(404) when a different user owns the generation', async () => {
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
    await expect(assertOwnsGenerationByUid(g.uid, u2.id)).rejects.toMatchObject({ status: 404 });
  });
});

function req(headers: Record<string, string> = {}) {
  return new Request('http://t/api/v1/x', { headers });
}

describe('requireApiTokenOrThrow', () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  it('throws 401 when Authorization header is missing', async () => {
    await expect(requireApiTokenOrThrow(req())).rejects.toThrow(ApiError);
  });

  it('throws 401 for malformed Authorization header', async () => {
    await expect(
      requireApiTokenOrThrow(req({ authorization: 'Bearer not-a-token' })),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('throws 401 for unknown token hash', async () => {
    const { token } = createApiToken();
    await expect(
      requireApiTokenOrThrow(req({ authorization: `Bearer ${token}` })),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('returns the user for a valid token', async () => {
    const db = getDb();
    const [u] = await db.insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
    const { token, hash, prefix } = createApiToken();
    await db.insert(apiTokens).values({
      userId: u.id,
      name: 'CI',
      tokenHash: hash,
      tokenPrefix: prefix,
    });
    const out = await requireApiTokenOrThrow(req({ authorization: `Bearer ${token}` }));
    expect(out.id).toBe(u.id);
  });

  it('throws 401 for revoked tokens', async () => {
    const db = getDb();
    const [u] = await db.insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
    const { token, hash, prefix } = createApiToken();
    await db.insert(apiTokens).values({
      userId: u.id,
      name: 'old',
      tokenHash: hash,
      tokenPrefix: prefix,
      revokedAt: new Date().toISOString(),
    });
    await expect(
      requireApiTokenOrThrow(req({ authorization: `Bearer ${token}` })),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('throws 401 for expired tokens', async () => {
    const db = getDb();
    const [u] = await db.insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
    const { token, hash, prefix } = createApiToken();
    const pastIso = new Date(Date.now() - 60_000).toISOString();
    await db.insert(apiTokens).values({
      userId: u.id,
      name: 'expired',
      tokenHash: hash,
      tokenPrefix: prefix,
      expiresAt: pastIso,
    });
    await expect(
      requireApiTokenOrThrow(req({ authorization: `Bearer ${token}` })),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('updates lastUsedAt for valid tokens', async () => {
    const db = getDb();
    const [u] = await db.insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
    const { token, hash, prefix } = createApiToken();
    const [t] = await db
      .insert(apiTokens)
      .values({ userId: u.id, name: 'CI', tokenHash: hash, tokenPrefix: prefix })
      .returning();
    await requireApiTokenOrThrow(req({ authorization: `Bearer ${token}` }));
    // Allow the fire-and-forget update to settle.
    await new Promise((r) => setTimeout(r, 20));
    const [reloaded] = await db.select().from(apiTokens).where(eq(apiTokens.id, t.id));
    expect(reloaded.lastUsedAt).toBeTruthy();
  });
});
