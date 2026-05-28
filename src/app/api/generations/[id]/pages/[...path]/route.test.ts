import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { generations, sites, users } from '@/db/schema';

const getBlobSpy = vi.fn();
const putBlobSpy = vi.fn();
vi.mock('@vercel/blob', () => ({
  get: (...a: any[]) => getBlobSpy(...a),
  put: (...a: any[]) => putBlobSpy(...a),
}));
vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }));

const fetchPageMarkdownSpy = vi.fn();
vi.mock('@/lib/markdown-pages/cloudflare', () => ({
  fetchPageMarkdown: (...a: any[]) => fetchPageMarkdownSpy(...a),
}));

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return { ...actual, generateText: vi.fn() };
});

import { GET, POST } from './route';
import { getCurrentUser } from '@/lib/auth';
import { generateText } from 'ai';

async function seedWithManifest(pages: { path: string; blobPath: string; status: 'ok' | 'failed' | 'skipped' }[]) {
  await setupTestDb();
  const db = getDb();
  const [u] = await db.insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
  const [s] = await db
    .insert(sites)
    .values({ userId: u.id, name: 'S', rootUrl: 'https://x.test', webhookTokenHash: 'a'.repeat(64), webhookTokenPrefix: 'lmt_aaaa' })
    .returning();
  const [g] = await db
    .insert(generations)
    .values({
      siteId: s.id,
      userId: u.id,
      trigger: 'manual',
      pagesStatus: 'succeeded',
      pagesManifestBlobPath: `gens/x/pages-manifest.json`,
    })
    .returning();
  getBlobSpy.mockImplementation(async (p: string) => {
    if (p === `gens/x/pages-manifest.json`) {
      return {
        stream: new Response(JSON.stringify({ pages: pages.map((pg) => ({ ...pg, status: pg.status, url: `https://x.test/${pg.path}` })) })).body,
      };
    }
    if (pages.some((pg) => pg.blobPath === p && pg.status === 'ok')) {
      return { stream: new Response('# Hello').body };
    }
    return null;
  });
  return { u, g };
}

const ctx = (id: string, path: string[]) => ({ params: Promise.resolve({ id, path }) });

describe('GET /api/generations/[id]/pages/[...path]', () => {
  beforeEach(() => {
    getBlobSpy.mockReset();
    vi.mocked(getCurrentUser).mockReset();
  });

  it('streams markdown for an allowed path', async () => {
    const { u, g } = await seedWithManifest([
      { path: 'docs/cdn', blobPath: 'gens/x/pages/docs/cdn.md', status: 'ok' },
    ]);
    vi.mocked(getCurrentUser).mockResolvedValue(u);
    const res = await GET(new Request('http://t'), ctx(g.uid, ['docs', 'cdn']));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/markdown/);
    const body = await res.text();
    expect(body).toBe('# Hello');
  });

  it('404 for a path not in the manifest', async () => {
    const { u, g } = await seedWithManifest([
      { path: 'docs/cdn', blobPath: 'gens/x/pages/docs/cdn.md', status: 'ok' },
    ]);
    vi.mocked(getCurrentUser).mockResolvedValue(u);
    const res = await GET(new Request('http://t'), ctx(g.uid, ['evil']));
    expect(res.status).toBe(404);
  });

  it('400 for non-uuid id', async () => {
    await setupTestDb();
    const db = getDb();
    const [u] = await db.insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
    vi.mocked(getCurrentUser).mockResolvedValue(u);
    const res = await GET(new Request('http://t'), ctx('not-a-uuid', ['docs']));
    expect(res.status).toBe(400);
  });

  it('404 for non-owner', async () => {
    const { g } = await seedWithManifest([
      { path: 'docs/cdn', blobPath: 'gens/x/pages/docs/cdn.md', status: 'ok' },
    ]);
    const db = getDb();
    const [other] = await db.insert(users).values({ name: 'B', email: 'b@b.test' }).returning();
    vi.mocked(getCurrentUser).mockResolvedValue(other);
    const res = await GET(new Request('http://t'), ctx(g.uid, ['docs', 'cdn']));
    expect(res.status).toBe(404);
  });
});

describe('POST /api/generations/[id]/pages/[...path]', () => {
  beforeEach(() => {
    getBlobSpy.mockReset();
    putBlobSpy.mockReset();
    fetchPageMarkdownSpy.mockReset();
    vi.mocked(getCurrentUser).mockReset();
    vi.unstubAllGlobals();
  });

  it('refetches content, extracts OG metadata, preserves summary/pageType, and updates Vercel Blob', async () => {
    const { u, g } = await seedWithManifest([
      { path: 'docs/cdn', blobPath: 'gens/x/pages/docs/cdn.md', status: 'ok' },
    ]);
    vi.mocked(getCurrentUser).mockResolvedValue(u);

    // Mock the existing blob content
    getBlobSpy.mockImplementation(async (p: string) => {
      if (p === `gens/x/pages-manifest.json`) {
        return {
          stream: new Response(
            JSON.stringify({
              pages: [
                {
                  url: 'https://x.test/docs/cdn',
                  path: 'docs/cdn',
                  blobPath: 'gens/x/pages/docs/cdn.md',
                  status: 'ok',
                },
              ],
            })
          ).body,
        };
      }
      if (p === 'gens/x/pages/docs/cdn.md') {
        return {
          stream: new Response(
            '---\n' +
              'title: Old Title\n' +
              'url: https://x.test/docs/cdn\n' +
              'summary: Preserved Summary\n' +
              'page_type: article\n' +
              'updated: 2026-05-14\n' +
              '---\n\n' +
              '# Old Content\n'
          ).body,
        };
      }
      return null;
    });

    // Mock HTML fetch
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => `
        <html>
          <head>
            <title>HTML title</title>
            <meta property="og:title" content="OG Cool Title" />
            <meta property="og:description" content="OG Description" />
            <meta property="og:image" content="/images/og.png" />
            <link rel="canonical" href="/canonical-path" />
          </head>
          <body>Content</body>
        </html>
      `,
    });
    vi.stubGlobal('fetch', fetchSpy);

    // Mock fetchPageMarkdown
    fetchPageMarkdownSpy.mockResolvedValue({
      markdown: '# Fresh Markdown Body\n',
      durationMs: 42,
    });

    // Call POST handler
    const res = await POST(new Request('http://t', { method: 'POST' }), ctx(g.uid, ['docs', 'cdn']));
    expect(res.status).toBe(200);

    // Verify fetch was called for the HTML
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringMatching(/https:\/\/x\.test\/docs\/cdn\?_cb=\d+/),
      expect.any(Object)
    );

    // Verify fetchPageMarkdown was called
    expect(fetchPageMarkdownSpy).toHaveBeenCalledWith(
      expect.stringMatching(/https:\/\/x\.test\/docs\/cdn\?_cb=\d+/)
    );

    // Verify put was called with the correct data
    expect(putBlobSpy).toHaveBeenCalledTimes(1);
    const [putPath, putBody] = putBlobSpy.mock.calls[0];
    expect(putPath).toBe('gens/x/pages/docs/cdn.md');
    
    expect(putBody).toContain('title: OG Cool Title');
    expect(putBody).toContain('summary: Preserved Summary');
    expect(putBody).toContain('page_type: article');
    expect(putBody).toContain('description: OG Description');
    expect(putBody).toContain('image: https://x.test/images/og.png');
    expect(putBody).toContain('ogImage: https://x.test/images/og.png');
    expect(putBody).toContain('canonical: https://x.test/canonical-path');
    expect(putBody).toContain('# Fresh Markdown Body');

    // Verify response body
    const resBody = await res.text();
    expect(resBody).toBe(putBody);
  });

  it('formats page markdown with AI when action=format is provided', async () => {
    const { u, g } = await seedWithManifest([
      { path: 'docs/cdn', blobPath: 'gens/x/pages/docs/cdn.md', status: 'ok' },
    ]);
    vi.mocked(getCurrentUser).mockResolvedValue(u);

    // Mock existing blob content
    getBlobSpy.mockImplementation(async (p: string) => {
      if (p === `gens/x/pages-manifest.json`) {
        return {
          stream: new Response(
            JSON.stringify({
              pages: [
                {
                  url: 'https://x.test/docs/cdn',
                  path: 'docs/cdn',
                  blobPath: 'gens/x/pages/docs/cdn.md',
                  status: 'ok',
                },
              ],
            })
          ).body,
        };
      }
      if (p === 'gens/x/pages/docs/cdn.md') {
        return {
          stream: new Response(
            '---\n' +
              'title: Old Title\n' +
              'url: https://x.test/docs/cdn\n' +
              'summary: Old Summary\n' +
              'page_type: article\n' +
              'updated: 2026-05-14\n' +
              '---\n\n' +
              '# Old Content\n'
          ).body,
        };
      }
      return null;
    });

    // Mock generateText for AI Format call (first pass returns forbidden word: innovative)
    vi.mocked(generateText)
      .mockResolvedValueOnce({
        text: '---\n' +
          'title: Innovative Title\n' +
          'url: https://x.test/docs/cdn\n' +
          'summary: An innovative summary.\n' +
          'page_type: article\n' +
          'updated: 2026-05-28\n' +
          '---\n\n' +
          '# H1 Content\n' +
          'body copy\n',
      } as any)
      // Second pass resolves clean content
      .mockResolvedValueOnce({
        text: '```markdown\n' +
          '---\n' +
          'title: Fresh Clean Title\n' +
          'url: https://x.test/docs/cdn\n' +
          'summary: A clean summary.\n' +
          'page_type: article\n' +
          'updated: 2026-05-28\n' +
          '---\n\n' +
          '# H1 Content\n' +
          'body copy\n' +
          '```',
      } as any);

    // Call POST handler with ?action=format
    const res = await POST(new Request('http://t?action=format', { method: 'POST' }), ctx(g.uid, ['docs', 'cdn']));
    expect(res.status).toBe(200);

    // Verify generateText was called twice (due to forbidden word innovative in frontmatter)
    expect(generateText).toHaveBeenCalledTimes(2);

    // Verify put was called with the cleaned second pass content (code fences removed)
    expect(putBlobSpy).toHaveBeenCalledTimes(1);
    const [putPath, putBody] = putBlobSpy.mock.calls[0];
    expect(putPath).toBe('gens/x/pages/docs/cdn.md');
    expect(putBody).not.toContain('```markdown');
    expect(putBody).toContain('title: Old Title');
    expect(putBody).toContain('summary: A clean summary.');
    expect(putBody).toContain('# H1 Content');

    // Verify response body is identical to put body
    const resBody = await res.text();
    expect(resBody).toBe(putBody);
  });
});
