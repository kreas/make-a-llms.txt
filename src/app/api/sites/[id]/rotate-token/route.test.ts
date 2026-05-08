import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { sites, users } from '@/db/schema';
import { eq } from 'drizzle-orm';

vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }));
import { POST } from './route';
import { getCurrentUser } from '@/lib/auth';

const ctx = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });

describe('POST rotate-token', () => {
  it('issues a new token and replaces the hash', async () => {
    await setupTestDb();
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
    vi.mocked(getCurrentUser).mockResolvedValue(u);

    const res = await POST(new Request('http://t', { method: 'POST' }), ctx(s.id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.webhookToken).toMatch(/^lmt_/);

    const [after] = await db.select().from(sites).where(eq(sites.id, s.id));
    expect(after.webhookTokenHash).not.toBe('a'.repeat(64));
  });
});
