import { describe, it, expect, beforeEach, vi } from 'vitest';

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

import { get, put } from '@/lib/blob';
import { generateText } from 'ai';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { pageSummaryCache, sites, users } from '@/db/schema';
import { setupTestDb } from '@/test/db';
import { hashBody, summarizePage } from './summarize-page';

function mockBlob(text: string) {
  vi.mocked(get).mockResolvedValue({
    stream: new Response(text).body!,
    pathname: 'p',
    url: 'u',
    contentType: 'text/markdown; charset=utf-8',
    contentDisposition: '',
    size: text.length,
    uploadedAt: new Date(),
    downloadUrl: 'u',
  } as any);
}

const PAGE = {
  url: 'https://x.test/about',
  path: 'about',
  filename: 'about.md',
  status: 'ok' as const,
  blobPath: 'gens/1/pages/about.md',
  bytes: 200,
  durationMs: 5,
};

const BODY = '# About\n\nWe build AI tools.\n';
const BLOB_CONTENT =
  '---\n' +
  'title: About\n' +
  'url: https://x.test/about\n' +
  'summary: \n' +
  'updated: 2026-05-14\n' +
  '---\n\n' +
  BODY;

async function seedSite(): Promise<number> {
  const db = getDb();
  const [u] = await db
    .insert(users)
    .values({ name: 'T', email: 't@t.test' })
    .returning();
  const [s] = await db
    .insert(sites)
    .values({
      userId: u.id,
      name: 'Acme',
      rootUrl: 'https://x.test',
      webhookTokenHash: 'a'.repeat(64),
      webhookTokenPrefix: 'lmt_aaaa',
    })
    .returning();
  return s.id;
}

describe('summarizePage', () => {
  let siteId: number;

  beforeEach(async () => {
    vi.clearAllMocks();
    await setupTestDb();
    siteId = await seedSite();
  });

  it('happy path: calls model, writes summary, persists cache row', async () => {
    mockBlob(BLOB_CONTENT);
    vi.mocked(generateText).mockResolvedValue({
      output: { summary: 'Acme builds AI tools.', page_type: 'about' },
    } as any);

    const result = await summarizePage({
      generationId: 1,
      siteId,
      page: PAGE,
      siteName: 'Acme',
      maxInputBytes: 1_000_000,
    });

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.pageType).toBe('about');
      expect(result.summaryBytes).toBeGreaterThan(0);
      expect(result.cached).toBe(false);
    }
    expect(put).toHaveBeenCalledTimes(1);
    const [pathArg, bodyArg] = vi.mocked(put).mock.calls[0];
    expect(pathArg).toBe('gens/1/pages/about.md');
    expect(bodyArg).toMatch(/^summary: Acme builds AI tools\.$/m);
    expect(bodyArg).toMatch(/^page_type: about$/m);

    const rows = await getDb()
      .select()
      .from(pageSummaryCache)
      .where(eq(pageSummaryCache.siteId, siteId));
    expect(rows).toHaveLength(1);
    expect(rows[0].urlPath).toBe('about');
    expect(rows[0].summary).toBe('Acme builds AI tools.');
    expect(rows[0].pageType).toBe('about');
    expect(rows[0].contentHash).toBe(hashBody(BODY));
  });

  it('cache hit: skips model call and reuses cached summary', async () => {
    await getDb().insert(pageSummaryCache).values({
      siteId,
      urlPath: 'about',
      url: 'https://x.test/about',
      contentHash: hashBody(BODY),
      summary: 'Cached summary text.',
      pageType: 'about',
    });
    mockBlob(BLOB_CONTENT);

    const result = await summarizePage({
      generationId: 1,
      siteId,
      page: PAGE,
      siteName: 'Acme',
      maxInputBytes: 1_000_000,
    });

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.cached).toBe(true);
      expect(result.pageType).toBe('about');
    }
    expect(generateText).not.toHaveBeenCalled();
    expect(put).toHaveBeenCalledTimes(1);
    const [, bodyArg] = vi.mocked(put).mock.calls[0];
    expect(bodyArg).toMatch(/^summary: Cached summary text\.$/m);
  });

  it('cache miss when hash differs: regenerates and updates cache', async () => {
    await getDb().insert(pageSummaryCache).values({
      siteId,
      urlPath: 'about',
      url: 'https://x.test/about',
      contentHash: 'stale-hash-from-prior-content',
      summary: 'Old summary.',
      pageType: 'other',
    });
    mockBlob(BLOB_CONTENT);
    vi.mocked(generateText).mockResolvedValue({
      output: { summary: 'Fresh summary.', page_type: 'about' },
    } as any);

    const result = await summarizePage({
      generationId: 1,
      siteId,
      page: PAGE,
      siteName: 'Acme',
      maxInputBytes: 1_000_000,
    });

    expect(result.status).toBe('ok');
    if (result.status === 'ok') expect(result.cached).toBe(false);
    expect(generateText).toHaveBeenCalledTimes(1);

    const rows = await getDb()
      .select()
      .from(pageSummaryCache)
      .where(eq(pageSummaryCache.siteId, siteId));
    expect(rows).toHaveLength(1);
    expect(rows[0].summary).toBe('Fresh summary.');
    expect(rows[0].pageType).toBe('about');
    expect(rows[0].contentHash).toBe(hashBody(BODY));
  });

  it('NO_SUMMARY: rewrites blob with empty summary, keeps page_type, caches empty', async () => {
    mockBlob(BLOB_CONTENT);
    vi.mocked(generateText).mockResolvedValue({
      output: { summary: '[NO_SUMMARY]', page_type: 'other' },
    } as any);

    const result = await summarizePage({
      generationId: 1,
      siteId,
      page: PAGE,
      siteName: 'Acme',
      maxInputBytes: 1_000_000,
    });

    expect(result.status).toBe('empty');
    if (result.status === 'empty') {
      expect(result.pageType).toBe('other');
      expect(result.cached).toBe(false);
    }
    const [, bodyArg] = vi.mocked(put).mock.calls[0];
    expect(bodyArg).toMatch(/^summary: $/m);
    expect(bodyArg).toMatch(/^page_type: other$/m);

    const rows = await getDb()
      .select()
      .from(pageSummaryCache)
      .where(eq(pageSummaryCache.siteId, siteId));
    expect(rows).toHaveLength(1);
    expect(rows[0].summary).toBe('');
    expect(rows[0].pageType).toBe('other');
  });

  it('empty-string summary is treated like NO_SUMMARY', async () => {
    mockBlob(BLOB_CONTENT);
    vi.mocked(generateText).mockResolvedValue({
      output: { summary: '   ', page_type: 'other' },
    } as any);

    const result = await summarizePage({
      generationId: 1,
      siteId,
      page: PAGE,
      siteName: 'Acme',
      maxInputBytes: 1_000_000,
    });

    expect(result.status).toBe('empty');
  });

  it('truncates the body when it exceeds maxInputBytes', async () => {
    const big = 'x'.repeat(50_000);
    mockBlob(
      '---\nurl: https://x.test/big\nsummary: \nupdated: 2026-05-14\n---\n\n' +
        big,
    );
    vi.mocked(generateText).mockResolvedValue({
      output: { summary: 'A.', page_type: 'article' },
    } as any);

    await summarizePage({
      generationId: 1,
      siteId,
      page: { ...PAGE, url: 'https://x.test/big', path: 'big' },
      siteName: 'Acme',
      maxInputBytes: 100,
    });

    const promptArg = vi.mocked(generateText).mock.calls[0]?.[0]?.prompt as string;
    expect(promptArg).toContain('[truncated]');
    expect(promptArg.length).toBeLessThan(50_000);
  });

  it('returns failed and does NOT rewrite blob on model error', async () => {
    mockBlob(BLOB_CONTENT);
    vi.mocked(generateText).mockRejectedValue(new Error('gateway 502'));

    const result = await summarizePage({
      generationId: 1,
      siteId,
      page: PAGE,
      siteName: 'Acme',
      maxInputBytes: 1_000_000,
    });

    expect(result.status).toBe('failed');
    if (result.status === 'failed') {
      expect(result.reason).toMatch(/gateway 502/);
    }
    expect(put).not.toHaveBeenCalled();

    const rows = await getDb()
      .select()
      .from(pageSummaryCache)
      .where(eq(pageSummaryCache.siteId, siteId));
    expect(rows).toHaveLength(0);
  });

  it('preserves description, image, ogImage, and canonical from existing frontmatter', async () => {
    const blobWithMeta =
      '---\n' +
      'title: About\n' +
      'url: https://x.test/about\n' +
      'summary: \n' +
      'updated: 2026-05-14\n' +
      'description: Acme builds AI tools for developers.\n' +
      'image: https://x.test/og.png\n' +
      'ogImage: https://x.test/og.png\n' +
      'canonical: https://x.test/about\n' +
      '---\n\n' +
      BODY;
    mockBlob(blobWithMeta);
    vi.mocked(generateText).mockResolvedValue({
      output: { summary: 'Acme builds AI tools.', page_type: 'about' },
    } as any);

    await summarizePage({
      generationId: 1,
      siteId,
      page: PAGE,
      siteName: 'Acme',
      maxInputBytes: 1_000_000,
    });

    const [, bodyArg] = vi.mocked(put).mock.calls[0];
    expect(bodyArg).toMatch(/^description: Acme builds AI tools for developers\.$/m);
    expect(bodyArg).toMatch(/^image: https:\/\/x\.test\/og\.png$/m);
    expect(bodyArg).toMatch(/^ogImage: https:\/\/x\.test\/og\.png$/m);
    expect(bodyArg).toMatch(/^canonical: https:\/\/x\.test\/about$/m);
  });

  it('returns failed when the blob cannot be loaded', async () => {
    vi.mocked(get).mockResolvedValue(null as any);

    const result = await summarizePage({
      generationId: 1,
      siteId,
      page: PAGE,
      siteName: 'Acme',
      maxInputBytes: 1_000_000,
    });

    expect(result.status).toBe('failed');
    expect(generateText).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });
});
