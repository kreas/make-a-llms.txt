import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { users, apiTokens } from '@/db/schema';
import { eq } from 'drizzle-orm';

vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }));

import { DELETE } from './route';
import { getCurrentUser } from '@/lib/auth';

describe('DELETE /api/api-tokens/[id]', () => {
  let userId: number;
  let tokenId: number;

  beforeEach(async () => {
    await setupTestDb();
    const db = getDb();
    const [u] = await db.insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
    userId = u.id;
    const [t] = await db
      .insert(apiTokens)
      .values({ userId, name: 'x', tokenHash: 'h'.repeat(43), tokenPrefix: 'mklt_pat_xx' })
      .returning();
    tokenId = t.id;
    vi.mocked(getCurrentUser).mockResolvedValue(u);
  });

  it('sets revokedAt on the token', async () => {
    const ctx = { params: Promise.resolve({ id: String(tokenId) }) };
    const res = await DELETE(new Request('http://t', { method: 'DELETE' }), ctx);
    expect(res.status).toBe(200);
    const [reloaded] = await getDb().select().from(apiTokens).where(eq(apiTokens.id, tokenId));
    expect(reloaded.revokedAt).toBeTruthy();
  });

  it('404 when token is not owned', async () => {
    const db = getDb();
    const [other] = await db.insert(users).values({ name: 'O', email: 'o@o.test' }).returning();
    vi.mocked(getCurrentUser).mockResolvedValue(other);
    const ctx = { params: Promise.resolve({ id: String(tokenId) }) };
    const res = await DELETE(new Request('http://t', { method: 'DELETE' }), ctx);
    expect(res.status).toBe(404);
  });
});
