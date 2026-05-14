import { describe, it, expect, beforeEach } from 'vitest';
import { setupTestDb } from '@/test/db';
import { sites, users, apiTokens } from '@/db/schema';
import { getDb } from '@/db';
import { assertOwnsSite, ApiError, requireApiTokenOrThrow } from './auth-guards';
import { createApiToken } from '@/lib/tokens/api-token';
import { eq } from 'drizzle-orm';

describe('auth-guards', () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  it('assertOwnsSite returns the site for the owner', async () => {
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

    const found = await assertOwnsSite(s.id, u.id);
    expect(found.id).toBe(s.id);
  });

  it('assertOwnsSite throws 404 for a different user', async () => {
    const db = getDb();
    const [u1] = await db.insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
    const [u2] = await db.insert(users).values({ name: 'B', email: 'b@b.test' }).returning();
    const [s] = await db
      .insert(sites)
      .values({
        userId: u1.id,
        name: 'S',
        rootUrl: 'https://s.test',
        webhookTokenHash: 'a'.repeat(64),
        webhookTokenPrefix: 'lmt_aaaa',
      })
      .returning();

    await expect(assertOwnsSite(s.id, u2.id)).rejects.toMatchObject({
      status: 404,
      code: 'not_found',
    });
  });

  it('assertOwnsSite throws 404 for missing site', async () => {
    await expect(assertOwnsSite(99999, 1)).rejects.toMatchObject({ status: 404 });
  });

  it('ApiError carries status and code', () => {
    const e = new ApiError(401, 'unauthenticated', 'Sign in required');
    expect(e.status).toBe(401);
    expect(e.code).toBe('unauthenticated');
    expect(e.message).toBe('Sign in required');
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
