import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { sites, users, generations, pageQuestionAnswersCache } from '@/db/schema';
import { eq } from 'drizzle-orm';

vi.mock('@/lib/blob', () => ({
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

import { get } from '@/lib/blob';
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
const QUESTION = 'How does X work?';
const MODEL = 'openai/gpt-5.5';

describe('GET /api/sites/[id]/questions/answer', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await setupTestDb();
  });

  it('returns 401 when unauthenticated', async () => {
    const { site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const res = await GET(
      new Request(`http://t?pageUrl=${PAGE_URL}&question=${QUESTION}&model=${MODEL}`),
      ctx(site.uid),
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 when parameters are missing', async () => {
    const { user, site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(user);

    const res = await GET(new Request('http://t'), ctx(site.uid));
    expect(res.status).toBe(400);
  });

  it('returns 400 when model is unsupported', async () => {
    const { user, site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(user);

    const res = await GET(
      new Request(`http://t?pageUrl=${PAGE_URL}&question=${QUESTION}&model=unsupported/model`),
      ctx(site.uid),
    );
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

    // Mock manifest/page fetch
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
      text: 'AI response text',
    } as any);

    const res = await GET(
      new Request(
        `http://t?pageUrl=${encodeURIComponent(PAGE_URL)}&question=${encodeURIComponent(
          QUESTION,
        )}&model=${encodeURIComponent(MODEL)}`,
      ),
      ctx(site.uid),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.answer).toBe('AI response text');

    // Check cache in db
    const cached = await getDb()
      .select()
      .from(pageQuestionAnswersCache)
      .where(eq(pageQuestionAnswersCache.siteId, site.id));
    expect(cached).toHaveLength(1);
    expect(cached[0].urlPath).toBe('page-a');
    expect(cached[0].question).toBe(QUESTION);
    expect(cached[0].model).toBe(MODEL);
    expect(cached[0].answer).toBe('AI response text');
  });

  it('calls AI, retrieves citations, and caches them on first request', async () => {
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

    // Mock manifest/page fetch
    vi.mocked(get).mockImplementation(async (path: string) => {
      if (path === 'gens/1/pages-manifest.json') {
        return { stream: new Response(MANIFEST_CONTENT).body! } as any;
      }
      if (path === 'gens/1/pages/page-a.md') {
        return { stream: new Response(PAGE_CONTENT).body! } as any;
      }
      return null as any;
    });

    const mockSources = [
      { type: 'source', sourceType: 'url', id: '1', url: 'https://test.com/link' }
    ];

    vi.mocked(generateText).mockResolvedValue({
      text: 'AI response text with citations',
      sources: mockSources,
    } as any);

    const res = await GET(
      new Request(
        `http://t?pageUrl=${encodeURIComponent(PAGE_URL)}&question=${encodeURIComponent(
          QUESTION,
        )}&model=${encodeURIComponent(MODEL)}`,
      ),
      ctx(site.uid),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.answer).toBe('AI response text with citations');
    expect(body.citations).toEqual(mockSources);

    // Check cache in db
    const cached = await getDb()
      .select()
      .from(pageQuestionAnswersCache)
      .where(eq(pageQuestionAnswersCache.siteId, site.id));
    expect(cached).toHaveLength(1);
    expect(cached[0].answer).toBe('AI response text with citations');
    expect(JSON.parse(cached[0].citations || '[]')).toEqual(mockSources);
  });

  it('returns cached answer on cache hit', async () => {
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
    await getDb().insert(pageQuestionAnswersCache).values({
      siteId: site.id,
      urlPath: 'page-a',
      question: QUESTION,
      model: MODEL,
      contentHash: hashBody('This is content A.\n'),
      answer: 'Cached AI response text',
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

    const res = await GET(
      new Request(
        `http://t?pageUrl=${encodeURIComponent(PAGE_URL)}&question=${encodeURIComponent(
          QUESTION,
        )}&model=${encodeURIComponent(MODEL)}`,
      ),
      ctx(site.uid),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.answer).toBe('Cached AI response text');
    expect(generateText).not.toHaveBeenCalled();
  });
});

describe('POST /api/sites/[id]/questions/answer', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await setupTestDb();
  });

  it('regenerates answer and updates cache', async () => {
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
    await getDb().insert(pageQuestionAnswersCache).values({
      siteId: site.id,
      urlPath: 'page-a',
      question: QUESTION,
      model: MODEL,
      contentHash: hashBody('This is content A.\n'),
      answer: 'Old response text',
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
      text: 'Newly generated response text',
    } as any);

    const res = await POST(
      new Request('http://t', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageUrl: PAGE_URL, question: QUESTION, model: MODEL }),
      }),
      ctx(site.uid),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.answer).toBe('Newly generated response text');
    expect(generateText).toHaveBeenCalledTimes(1);

    // Verify cache updated in db
    const cached = await getDb()
      .select()
      .from(pageQuestionAnswersCache)
      .where(eq(pageQuestionAnswersCache.siteId, site.id));
    expect(cached).toHaveLength(1);
    expect(cached[0].answer).toBe('Newly generated response text');
  });
});
