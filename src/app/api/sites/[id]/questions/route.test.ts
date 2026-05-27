import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { sites, users, generations, pageQuestionsCache } from '@/db/schema';
import { eq } from 'drizzle-orm';

vi.mock('@vercel/blob', () => ({
  get: vi.fn(),
  put: vi.fn(async (pathname: string) => ({ url: `https://blob.test/${pathname}`, pathname })),
}));

vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai');
  return {
    ...actual,
    generateText: vi.fn(),
  };
});

vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }));

import { get } from '@vercel/blob';
import { generateText } from 'ai';
import { getCurrentUser } from '@/lib/auth';
import { hashBody } from '@/lib/workflow/summarize-page';
import { GET, POST } from './route';

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

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

const PAGE_URL = 'https://example.com/page-a';
const MANIFEST_CONTENT = JSON.stringify({
  pages: [
    {
      url: PAGE_URL,
      path: 'page-a',
      blobPath: 'gens/1/pages/page-a.md',
      status: 'ok',
    },
  ],
});
const PAGE_CONTENT = '---\ntitle: Page A\nurl: https://example.com/page-a\n---\n\nThis is content A.\n';

describe('GET /api/sites/[id]/questions', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await setupTestDb();
  });

  it('returns 401 when unauthenticated', async () => {
    const { site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const res = await GET(new Request(`http://t?pageUrl=${PAGE_URL}`), ctx(site.uid));
    expect(res.status).toBe(401);
  });

  it('returns 404 for cross-tenant site', async () => {
    const { site } = await makeUserAndSite('a@a.test');
    const { user: other } = await makeUserAndSite('b@b.test');
    vi.mocked(getCurrentUser).mockResolvedValue(other);

    const res = await GET(new Request(`http://t?pageUrl=${PAGE_URL}`), ctx(site.uid));
    expect(res.status).toBe(404);
  });

  it('returns 400 when pageUrl is missing', async () => {
    const { user, site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(user);

    const res = await GET(new Request('http://t'), ctx(site.uid));
    expect(res.status).toBe(400);
  });

  it('calls AI and caches on first request', async () => {
    const { user, site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(user);

    // Seed generation
    await getDb()
      .insert(generations)
      .values({
        siteId: site.id,
        userId: user.id,
        status: 'succeeded',
        trigger: 'manual',
        pagesStatus: 'succeeded',
        pagesManifestBlobPath: 'gens/1/pages-manifest.json',
      });

    // Mock manifest fetch
    vi.mocked(get).mockImplementation(async (path: string) => {
      if (path === 'gens/1/pages-manifest.json') {
        return { stream: new Response(MANIFEST_CONTENT).body! } as any;
      }
      if (path === 'gens/1/pages/page-a.md') {
        return { stream: new Response(PAGE_CONTENT).body! } as any;
      }
      return null as any;
    });

    vi.mocked(generateText).mockResolvedValue({
      output: { questions: ['Q1', 'Q2', 'Q3'] },
    } as any);

    const res = await GET(new Request(`http://t?pageUrl=${encodeURIComponent(PAGE_URL)}`), ctx(site.uid));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.questions).toEqual(['Q1', 'Q2', 'Q3']);

    // Check cache in db
    const cached = await getDb()
      .select()
      .from(pageQuestionsCache)
      .where(eq(pageQuestionsCache.siteId, site.id));
    expect(cached).toHaveLength(1);
    expect(cached[0].urlPath).toBe('page-a');
    expect(JSON.parse(cached[0].questions)).toEqual(['Q1', 'Q2', 'Q3']);
  });

  it('returns cached questions on cache hit', async () => {
    const { user, site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(user);

    await getDb()
      .insert(generations)
      .values({
        siteId: site.id,
        userId: user.id,
        status: 'succeeded',
        trigger: 'manual',
        pagesStatus: 'succeeded',
        pagesManifestBlobPath: 'gens/1/pages-manifest.json',
      });

    // Seed cache
    await getDb().insert(pageQuestionsCache).values({
      siteId: site.id,
      urlPath: 'page-a',
      url: PAGE_URL,
      contentHash: hashBody('This is content A.\n'),
      questions: JSON.stringify(['Cached Q1', 'Cached Q2']),
    });

    vi.mocked(get).mockImplementation(async (path: string) => {
      if (path === 'gens/1/pages-manifest.json') {
        return { stream: new Response(MANIFEST_CONTENT).body! } as any;
      }
      if (path === 'gens/1/pages/page-a.md') {
        return { stream: new Response(PAGE_CONTENT).body! } as any;
      }
      return null as any;
    });

    const res = await GET(new Request(`http://t?pageUrl=${encodeURIComponent(PAGE_URL)}`), ctx(site.uid));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.questions).toEqual(['Cached Q1', 'Cached Q2']);
    expect(generateText).not.toHaveBeenCalled();
  });
});

describe('POST /api/sites/[id]/questions', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await setupTestDb();
  });

  it('regenerates questions and updates cache', async () => {
    const { user, site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(user);

    await getDb()
      .insert(generations)
      .values({
        siteId: site.id,
        userId: user.id,
        status: 'succeeded',
        trigger: 'manual',
        pagesStatus: 'succeeded',
        pagesManifestBlobPath: 'gens/1/pages-manifest.json',
      });

    // Seed old cache
    await getDb().insert(pageQuestionsCache).values({
      siteId: site.id,
      urlPath: 'page-a',
      url: PAGE_URL,
      contentHash: hashBody('This is content A.\n'),
      questions: JSON.stringify(['Old Q1', 'Old Q2']),
    });

    vi.mocked(get).mockImplementation(async (path: string) => {
      if (path === 'gens/1/pages-manifest.json') {
        return { stream: new Response(MANIFEST_CONTENT).body! } as any;
      }
      if (path === 'gens/1/pages/page-a.md') {
        return { stream: new Response(PAGE_CONTENT).body! } as any;
      }
      return null as any;
    });

    vi.mocked(generateText).mockResolvedValue({
      output: { questions: ['New Q1', 'New Q2', 'New Q3'] },
    } as any);

    const res = await POST(
      new Request('http://t', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageUrl: PAGE_URL }),
      }),
      ctx(site.uid),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.questions).toEqual(['New Q1', 'New Q2', 'New Q3']);
    expect(generateText).toHaveBeenCalledTimes(1);

    // Verify cache updated in db
    const cached = await getDb()
      .select()
      .from(pageQuestionsCache)
      .where(eq(pageQuestionsCache.siteId, site.id));
    expect(cached).toHaveLength(1);
    expect(JSON.parse(cached[0].questions)).toEqual(['New Q1', 'New Q2', 'New Q3']);
  });
});
