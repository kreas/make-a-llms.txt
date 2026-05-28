import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { generations, sites, users } from '@/db/schema';
import { eq } from 'drizzle-orm';

vi.mock('@vercel/blob', () => ({
  get: vi.fn(),
  put: vi.fn(async (pathname: string, body: string) => ({
    url: `https://blob.test/${pathname}`,
    pathname,
  })),
}));

vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai');
  return {
    ...actual,
    generateText: vi.fn(),
  };
});

vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }));

import { get, put } from '@vercel/blob';
import { generateText } from 'ai';
import { getCurrentUser } from '@/lib/auth';
import { POST } from './route';

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function makeUserAndSite(email: string) {
  const db = getDb();
  const [u] = await db.insert(users).values({ name: 'X', email }).returning();
  const prefix = email.split('@')[0].slice(0, 4).padEnd(4, 'x');
  const hash = prefix.repeat(16);
  const [s] = await db
    .insert(sites)
    .values({
      userId: u.id,
      name: 'S',
      rootUrl: `https://${email.split('@')[0]}.test`,
      webhookTokenHash: hash,
      webhookTokenPrefix: `lmt_${prefix}`,
    })
    .returning();
  return { user: u, site: s };
}

describe('POST /api/generations/[id]/rewrite', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await setupTestDb();
  });

  it('401 when unauthenticated', async () => {
    const { site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const res = await POST(new Request('http://t', { method: 'POST' }), ctx('00000000-0000-0000-0000-000000000000'));
    expect(res.status).toBe(401);
  });

  it('404 for cross-tenant generation', async () => {
    const { user: owner, site } = await makeUserAndSite('a@a.test');
    const { user: other } = await makeUserAndSite('b@b.test');
    
    const [gen] = await getDb()
      .insert(generations)
      .values({
        siteId: site.id,
        userId: owner.id,
        status: 'succeeded',
        trigger: 'manual',
        llmsBlobPath: 'gens/1/llms.txt',
      })
      .returning();

    vi.mocked(getCurrentUser).mockResolvedValue(other);

    const res = await POST(new Request('http://t', { method: 'POST' }), ctx(gen.uid));
    expect(res.status).toBe(404);
  });

  it('400 when llms.txt file is not ready', async () => {
    const { user, site } = await makeUserAndSite('a@a.test');
    const [gen] = await getDb()
      .insert(generations)
      .values({
        siteId: site.id,
        userId: user.id,
        status: 'failed',
        trigger: 'manual',
      })
      .returning();

    vi.mocked(getCurrentUser).mockResolvedValue(user);

    const res = await POST(new Request('http://t', { method: 'POST' }), ctx(gen.uid));
    expect(res.status).toBe(400);
  });

  it('calls AI and overwrites llms.txt in Vercel Blob', async () => {
    const { user, site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(user);

    const [gen] = await getDb()
      .insert(generations)
      .values({
        siteId: site.id,
        userId: user.id,
        status: 'succeeded',
        trigger: 'manual',
        llmsBlobPath: 'gens/1/llms.txt',
      })
      .returning();

    // Mock blob get
    vi.mocked(get).mockResolvedValue({
      stream: new Response('# Rough Title\n\n- [Link](https://example.com)').body!,
    } as any);

    // Mock first pass (no forbidden words)
    vi.mocked(generateText).mockResolvedValue({
      text: '# Spec Title\n\n> Spec description.\n\n## Section\n- [Link](https://example.com): Factual info.',
    } as any);

    const res = await POST(new Request('http://t', { method: 'POST' }), ctx(gen.uid));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.content).toBe('# Spec Title\n\n> Spec description.\n\n## Section\n- [Link](https://example.com): Factual info.');

    expect(generateText).toHaveBeenCalledTimes(1);
    expect(put).toHaveBeenCalledWith('gens/1/llms.txt', expect.any(String), {
      access: 'private',
      contentType: 'text/plain; charset=utf-8',
      addRandomSuffix: false,
      allowOverwrite: true,
    });
  });

  it('makes a second pass call when forbidden patterns are returned in the first pass', async () => {
    const { user, site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(user);

    const [gen] = await getDb()
      .insert(generations)
      .values({
        siteId: site.id,
        userId: user.id,
        status: 'succeeded',
        trigger: 'manual',
        llmsBlobPath: 'gens/1/llms.txt',
      })
      .returning();

    vi.mocked(get).mockResolvedValue({
      stream: new Response('# Rough Title').body!,
    } as any);

    // Mock first pass returning "seamless" and "em dash —"
    vi.mocked(generateText)
      .mockResolvedValueOnce({
        text: '# Spec Title\n\n> Seamless—experience.',
      } as any)
      .mockResolvedValueOnce({
        text: '# Spec Title\n\n> Good experience.',
      } as any);

    const res = await POST(new Request('http://t', { method: 'POST' }), ctx(gen.uid));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.content).toBe('# Spec Title\n\n> Good experience.');

    expect(generateText).toHaveBeenCalledTimes(2);
    const secondPassCall = vi.mocked(generateText).mock.calls[1][0];
    expect(secondPassCall.system).toContain('The previous output contained these forbidden patterns: seamless, —');
  });
});
