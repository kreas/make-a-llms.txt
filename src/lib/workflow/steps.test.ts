import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Readable } from 'node:stream';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { sites, generations, users } from '@/db/schema';
import { eq } from 'drizzle-orm';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

vi.mock('execa', () => ({ execa: vi.fn() }));
vi.mock('@/lib/blob', () => ({
  put: vi.fn(async (pathname: string) => ({
    url: `https://blob.test/${pathname}`,
    pathname,
  })),
  get: vi.fn(),
}));
vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai');
  return { ...actual, generateText: vi.fn() };
});
vi.mock('@/lib/sitemap-discover', () => ({
  discoverSitemap: vi.fn(async () => 'https://x.test/sitemap.xml'),
}));
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: vi.fn(async () => ({ data: { id: 'em1' }, error: null })) },
  })),
}));
vi.mock('@/lib/markdown-pages/cloudflare', () => ({
  fetchPageMarkdown: vi.fn(),
  CfClientError: class extends Error { kind = 'transient' as const; },
}));
vi.mock('@/lib/markdown-pages/sitemap-urls', () => ({
  loadSitemapUrls: vi.fn(),
}));

import { execa } from 'execa';
import { get, put } from '@/lib/blob';
import { generateText } from 'ai';
import { fetchPageMarkdown } from '@/lib/markdown-pages/cloudflare';
import { loadSitemapUrls } from '@/lib/markdown-pages/sitemap-urls';
import {
  prepareStep,
  runGenStep,
  runFullStep,
  completeStep,
  notifyStep,
  failStep,
  runPagesStepSafe,
  runSummariesStepSafe,
} from './steps';

function fakeProc(stdout: string, exitCode = 0) {
  const promise: any = Promise.resolve({ stdout, stderr: '', exitCode });
  promise.stdout = Readable.from([Buffer.from(stdout)]);
  promise.stderr = Readable.from([]);
  return promise;
}

describe('workflow steps', () => {
  let userId: number;
  let siteId: number;
  let generationId: number;
  let siteUid: string;
  let generationUid: string;

  beforeEach(async () => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () => new Response('<html><head><title>Mocked HTML Title</title><meta name="description" content="Mocked HTML Desc"><link rel="canonical" href="https://x.test/canonical-a"></head><body></body></html>'));

    await setupTestDb();
    const db = getDb();
    const [u] = await db.insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
    userId = u.id;
    const [s] = await db
      .insert(sites)
      .values({
        userId,
        name: 'S',
        rootUrl: 'https://x.test',
        webhookTokenHash: 'a'.repeat(64),
        webhookTokenPrefix: 'lmt_aaaa',
      })
      .returning();
    siteId = s.id;
    siteUid = s.uid;
    const [g] = await db
      .insert(generations)
      .values({ siteId, userId, trigger: 'manual', notifyEmail: false })
      .returning();
    generationId = g.id;
    generationUid = g.uid;

    vi.mocked(execa).mockReturnValue(fakeProc('# fixture\n'));
  });

  it('prepareStep flips status to running and resolves sitemap', async () => {
    const out = await prepareStep(generationId);
    expect(out.sitemapUrl).toBe('https://x.test/sitemap.xml');
    expect(out.rootUrl).toBe('https://x.test');
    const [g] = await getDb().select().from(generations).where(eq(generations.id, generationId));
    expect(g.status).toBe('running');
    expect(g.startedAt).not.toBeNull();
    expect(g.resolvedSitemapUrl).toBe('https://x.test/sitemap.xml');
  });

  it('prepareStep is idempotent on resume (does not overwrite startedAt)', async () => {
    await prepareStep(generationId);
    const [first] = await getDb().select().from(generations).where(eq(generations.id, generationId));
    await prepareStep(generationId);
    const [second] = await getDb().select().from(generations).where(eq(generations.id, generationId));
    expect(second.startedAt).toBe(first.startedAt);
  });

  it('runGenStep writes llmsBlobPath', async () => {
    await runGenStep(generationId, 'https://x.test/sitemap.xml');
    const [g] = await getDb().select().from(generations).where(eq(generations.id, generationId));
    expect(g.llmsBlobPath).toBe(`projects/${siteUid}/${generationUid}/llms.txt`);
  });

  it('runFullStep writes llmsFullBlobPath', async () => {
    await runFullStep(generationId, 'https://x.test/sitemap.xml');
    const [g] = await getDb().select().from(generations).where(eq(generations.id, generationId));
    expect(g.llmsFullBlobPath).toBe(`projects/${siteUid}/${generationUid}/llms-full.txt`);
  });

  it('completeStep marks succeeded and updates site.lastGeneratedAt', async () => {
    await completeStep(generationId);
    const [g] = await getDb().select().from(generations).where(eq(generations.id, generationId));
    const [s] = await getDb().select().from(sites).where(eq(sites.id, siteId));
    expect(g.status).toBe('succeeded');
    expect(g.completedAt).not.toBeNull();
    expect(s.lastGeneratedAt).not.toBeNull();
  });

  it('notifyStep is a no-op when notifyEmail=false', async () => {
    await notifyStep(generationId);
    const [g] = await getDb().select().from(generations).where(eq(generations.id, generationId));
    expect(g.notifiedAt).toBeNull();
  });

  it('notifyStep sends email and sets notifiedAt when notifyEmail=true', async () => {
    await getDb()
      .update(generations)
      .set({ notifyEmail: true, status: 'succeeded' })
      .where(eq(generations.id, generationId));
    await notifyStep(generationId);
    const [g] = await getDb().select().from(generations).where(eq(generations.id, generationId));
    expect(g.notifiedAt).not.toBeNull();
  });

  it('notifyStep is idempotent when notifiedAt is already set', async () => {
    await getDb()
      .update(generations)
      .set({ notifyEmail: true, notifiedAt: '2026-05-07T00:00:00Z' })
      .where(eq(generations.id, generationId));
    await notifyStep(generationId);
    const [g] = await getDb().select().from(generations).where(eq(generations.id, generationId));
    expect(g.notifiedAt).toBe('2026-05-07T00:00:00Z');
  });

  it('failStep marks generation failed with truncated message', async () => {
    await failStep(generationId, 'prepare', new Error('No sitemap found'));
    const [g] = await getDb().select().from(generations).where(eq(generations.id, generationId));
    expect(g.status).toBe('failed');
    expect(g.errorMessage).toMatch(/No sitemap found/);
    expect(g.completedAt).not.toBeNull();
  });

  it('runPagesStepSafe skips when sitemap exceeds the 250 cap', async () => {
    vi.mocked(loadSitemapUrls).mockResolvedValue(
      Array.from({ length: 300 }, (_, i) => `https://x.test/p${i}`),
    );
    process.env.CLOUDFLARE_ACCOUNT_ID = 'a';
    process.env.CLOUDFLARE_API_TOKEN = 't';
    await runPagesStepSafe(generationId, 'https://x.test/sitemap.xml', 'https://x.test');
    const [g] = await getDb().select().from(generations).where(eq(generations.id, generationId));
    expect(g.pagesStatus).toBe('skipped');
    expect(g.pagesErrorMessage).toMatch(/cap/i);
  });

  it('runPagesStepSafe fails when CF env vars are missing', async () => {
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
    delete process.env.CLOUDFLARE_API_TOKEN;
    vi.mocked(loadSitemapUrls).mockResolvedValue(['https://x.test/a']);
    await runPagesStepSafe(generationId, 'https://x.test/sitemap.xml', 'https://x.test');
    const [g] = await getDb().select().from(generations).where(eq(generations.id, generationId));
    expect(g.pagesStatus).toBe('failed');
    expect(g.pagesErrorMessage).toMatch(/credentials/i);
  });

  it('runPagesStepSafe succeeds on happy path and writes a manifest', async () => {
    process.env.CLOUDFLARE_ACCOUNT_ID = 'a';
    process.env.CLOUDFLARE_API_TOKEN = 't';
    vi.mocked(loadSitemapUrls).mockResolvedValue([
      'https://x.test/a',
      'https://x.test/b',
    ]);
    vi.mocked(fetchPageMarkdown).mockResolvedValue({ markdown: '# Hi', durationMs: 10 });
    await runPagesStepSafe(generationId, 'https://x.test/sitemap.xml', 'https://x.test');
    const [g] = await getDb().select().from(generations).where(eq(generations.id, generationId));
    expect(g.pagesStatus).toBe('succeeded');
    expect(g.pagesCount).toBe(2);
    expect(g.pagesManifestBlobPath).toBe(`projects/${siteUid}/${generationUid}/pages-manifest.json`);

    // Verify that the HTML metadata is extracted and included in the frontmatter
    expect(put).toHaveBeenCalledWith(
      expect.stringContaining(`projects/${siteUid}/${generationUid}/pages/`),
      expect.stringContaining('description: Mocked HTML Desc'),
      expect.any(Object)
    );
  });

  it('runPagesStepSafe still succeeds when some CF calls fail', async () => {
    process.env.CLOUDFLARE_ACCOUNT_ID = 'a';
    process.env.CLOUDFLARE_API_TOKEN = 't';
    vi.mocked(loadSitemapUrls).mockResolvedValue([
      'https://x.test/a',
      'https://x.test/b',
    ]);
    vi.mocked(fetchPageMarkdown)
      .mockResolvedValueOnce({ markdown: '# A', durationMs: 10 })
      .mockRejectedValueOnce(Object.assign(new Error('CF 502'), { kind: 'transient' }));
    await runPagesStepSafe(generationId, 'https://x.test/sitemap.xml', 'https://x.test');
    const [g] = await getDb().select().from(generations).where(eq(generations.id, generationId));
    expect(g.pagesStatus).toBe('succeeded');
  });

  it('runPagesStepSafe honors cancellation flag', async () => {
    process.env.CLOUDFLARE_ACCOUNT_ID = 'a';
    process.env.CLOUDFLARE_API_TOKEN = 't';
    vi.mocked(loadSitemapUrls).mockResolvedValue(['https://x.test/a']);
    vi.mocked(fetchPageMarkdown).mockResolvedValue({ markdown: '# A', durationMs: 1 });
    await getDb().update(generations).set({ status: 'cancelled' }).where(eq(generations.id, generationId));
    await runPagesStepSafe(generationId, 'https://x.test/sitemap.xml', 'https://x.test');
    const [g] = await getDb().select().from(generations).where(eq(generations.id, generationId));
    expect(g.pagesStatus).toBe('cancelled');
    expect(g.pagesManifestBlobPath).toBeNull();
  });

  it('notifyStep mentions pages when pagesStatus=succeeded', async () => {
    const send = vi.fn(async () => ({ data: { id: 'x' }, error: null }));
    const { Resend } = await import('resend');
    vi.mocked(Resend).mockImplementation(function () { return { emails: { send } }; } as any);

    await getDb()
      .update(generations)
      .set({
        notifyEmail: true,
        status: 'succeeded',
        pagesStatus: 'succeeded',
        pagesCount: 7,
      })
      .where(eq(generations.id, generationId));
    process.env.RESEND_API_KEY = 'k';
    await notifyStep(generationId);
    const body = send.mock.calls[0]?.[0]?.html as string;
    expect(body).toMatch(/markdown for 7/i);
  });
});

describe('runSummariesStepSafe', () => {
  let userId: number;
  let siteId: number;
  let generationId: number;
  let siteUid: string;
  let generationUid: string;

  beforeEach(async () => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () => new Response('<html><head><title>Mocked HTML Title</title><meta name="description" content="Mocked HTML Desc"><link rel="canonical" href="https://x.test/canonical-a"></head><body></body></html>'));

    await setupTestDb();
    const db = getDb();
    const [u] = await db.insert(users).values({ name: 'A', email: 's@s.test' }).returning();
    userId = u.id;
    const [s] = await db
      .insert(sites)
      .values({
        userId,
        name: 'Acme',
        rootUrl: 'https://x.test',
        webhookTokenHash: 'a'.repeat(64),
        webhookTokenPrefix: 'lmt_aaaa',
      })
      .returning();
    siteId = s.id;
    siteUid = s.uid;
    const [g] = await db
      .insert(generations)
      .values({ siteId, userId, trigger: 'manual', notifyEmail: false })
      .returning();
    generationId = g.id;
    generationUid = g.uid;
    vi.clearAllMocks();
    process.env.AI_SUMMARY_RETRY_DELAY_MS = '0';
  });

  function manifestBlob(pages: Array<{ url: string; path: string; status: 'ok' | 'failed' | 'skipped' }>) {
    return {
      stream: new Response(
        JSON.stringify({
          version: 1,
          generationId,
          siteRootUrl: 'https://x.test',
          sitemapUrl: 'https://x.test/sitemap.xml',
          generatedAt: '2026-05-14T00:00:00Z',
          totalUrls: pages.length,
          successCount: pages.filter(p => p.status === 'ok').length,
          failedCount: 0,
          skippedCount: 0,
          pages: pages.map(p => ({
            url: p.url,
            path: p.path,
            filename: `${p.path}.md`,
            status: p.status,
            blobPath: p.status === 'ok' ? `projects/${siteUid}/${generationUid}/pages/${p.path}.md` : null,
            bytes: 100,
            durationMs: 1,
          })),
        }),
      ).body!,
    };
  }

  function pageBlob(url: string) {
    return {
      stream: new Response(
        `title: T\nurl: ${url}\nsummary: \nupdated: 2026-05-14\n\n# Hello\n`,
      ).body!,
    };
  }

  it('skips when upstream pagesStatus is not succeeded', async () => {
    await getDb()
      .update(generations)
      .set({ pagesStatus: 'failed' })
      .where(eq(generations.id, generationId));
    await runSummariesStepSafe(generationId);
    const [g] = await getDb().select().from(generations).where(eq(generations.id, generationId));
    expect(g.summariesStatus).toBe('skipped');
    expect(generateText).not.toHaveBeenCalled();
  });

  it('skips when there is no pages manifest', async () => {
    await getDb()
      .update(generations)
      .set({ pagesStatus: 'succeeded', pagesManifestBlobPath: null })
      .where(eq(generations.id, generationId));
    await runSummariesStepSafe(generationId);
    const [g] = await getDb().select().from(generations).where(eq(generations.id, generationId));
    expect(g.summariesStatus).toBe('skipped');
  });

  it('fails when AI Gateway credentials are missing', async () => {
    await getDb()
      .update(generations)
      .set({
        pagesStatus: 'succeeded',
        pagesManifestBlobPath: `projects/${siteUid}/${generationUid}/pages-manifest.json`,
      })
      .where(eq(generations.id, generationId));
    vi.mocked(get).mockResolvedValueOnce(manifestBlob([{ url: 'https://x.test/a', path: 'a', status: 'ok' }]) as any);
    delete process.env.AI_GATEWAY_API_KEY;
    delete process.env.VERCEL_OIDC_TOKEN;
    await runSummariesStepSafe(generationId);
    const [g] = await getDb().select().from(generations).where(eq(generations.id, generationId));
    expect(g.summariesStatus).toBe('failed');
    expect(g.summariesErrorMessage).toMatch(/credentials/i);
  });

  it('succeeds on happy path and writes manifest + counts', async () => {
    await getDb()
      .update(generations)
      .set({
        pagesStatus: 'succeeded',
        pagesManifestBlobPath: `projects/${siteUid}/${generationUid}/pages-manifest.json`,
      })
      .where(eq(generations.id, generationId));
    process.env.AI_GATEWAY_API_KEY = 'test';

    vi.mocked(get)
      .mockResolvedValueOnce(manifestBlob([
        { url: 'https://x.test/a', path: 'a', status: 'ok' },
        { url: 'https://x.test/b', path: 'b', status: 'ok' },
      ]) as any)
      .mockResolvedValueOnce(pageBlob('https://x.test/a') as any)
      .mockResolvedValueOnce(pageBlob('https://x.test/b') as any);

    vi.mocked(generateText).mockResolvedValue({
      output: { summary: 'A short summary.', page_type: 'article' },
    } as any);

    await runSummariesStepSafe(generationId);
    const [g] = await getDb().select().from(generations).where(eq(generations.id, generationId));
    expect(g.summariesStatus).toBe('succeeded');
    expect(g.summariesCount).toBe(2);
    expect(g.summariesEmptyCount).toBe(0);
    expect(g.summariesFailedCount).toBe(0);
    expect(g.summariesManifestBlobPath).toBe(`projects/${siteUid}/${generationUid}/summaries-manifest.json`);
  });

  it('tallies empty and failed outcomes separately', async () => {
    await getDb()
      .update(generations)
      .set({
        pagesStatus: 'succeeded',
        pagesManifestBlobPath: `projects/${siteUid}/${generationUid}/pages-manifest.json`,
      })
      .where(eq(generations.id, generationId));
    process.env.AI_GATEWAY_API_KEY = 'test';

    vi.mocked(get)
      .mockResolvedValueOnce(manifestBlob([
        { url: 'https://x.test/a', path: 'a', status: 'ok' },
        { url: 'https://x.test/b', path: 'b', status: 'ok' },
        { url: 'https://x.test/c', path: 'c', status: 'ok' },
      ]) as any)
      .mockResolvedValueOnce(pageBlob('https://x.test/a') as any)
      .mockResolvedValueOnce(pageBlob('https://x.test/b') as any)
      .mockResolvedValueOnce(pageBlob('https://x.test/c') as any)
      // Pass 2 retry of C re-reads its blob.
      .mockResolvedValueOnce(pageBlob('https://x.test/c') as any);

    vi.mocked(generateText)
      // Pass 1: A ok, B empty, C fails
      .mockResolvedValueOnce({ output: { summary: 'Good summary.', page_type: 'article' } } as any)
      .mockResolvedValueOnce({ output: { summary: '[NO_SUMMARY]', page_type: 'other' } } as any)
      .mockRejectedValueOnce(new Error('gateway down'))
      // Pass 2 (only C retries): also fails
      .mockRejectedValueOnce(new Error('still down'));

    await runSummariesStepSafe(generationId);
    const [g] = await getDb().select().from(generations).where(eq(generations.id, generationId));
    expect(g.summariesStatus).toBe('succeeded');
    expect(g.summariesCount).toBe(1);
    expect(g.summariesEmptyCount).toBe(1);
    expect(g.summariesFailedCount).toBe(1);
  });

  it('retries pages that fail in the first pass and succeeds on retry', async () => {
    await getDb()
      .update(generations)
      .set({
        pagesStatus: 'succeeded',
        pagesManifestBlobPath: `projects/${siteUid}/${generationUid}/pages-manifest.json`,
      })
      .where(eq(generations.id, generationId));
    process.env.AI_GATEWAY_API_KEY = 'test';

    vi.mocked(get)
      .mockResolvedValueOnce(manifestBlob([
        { url: 'https://x.test/a', path: 'a', status: 'ok' },
      ]) as any)
      // Pass 1 reads the page blob
      .mockResolvedValueOnce(pageBlob('https://x.test/a') as any)
      // Pass 2 (retry) reads it again
      .mockResolvedValueOnce(pageBlob('https://x.test/a') as any);

    vi.mocked(generateText)
      .mockRejectedValueOnce(new Error('transient 503'))
      .mockResolvedValueOnce({ output: { summary: 'Worked on retry.', page_type: 'article' } } as any);

    await runSummariesStepSafe(generationId);
    const [g] = await getDb().select().from(generations).where(eq(generations.id, generationId));
    expect(g.summariesStatus).toBe('succeeded');
    expect(g.summariesCount).toBe(1);
    expect(g.summariesFailedCount).toBe(0);
  });

  it('marks cancelled when the generation is cancelled mid-loop', async () => {
    await getDb()
      .update(generations)
      .set({
        pagesStatus: 'succeeded',
        pagesManifestBlobPath: `projects/${siteUid}/${generationUid}/pages-manifest.json`,
        status: 'cancelled',
      })
      .where(eq(generations.id, generationId));
    process.env.AI_GATEWAY_API_KEY = 'test';

    vi.mocked(get).mockResolvedValueOnce(manifestBlob([
      { url: 'https://x.test/a', path: 'a', status: 'ok' },
    ]) as any);

    await runSummariesStepSafe(generationId);
    const [g] = await getDb().select().from(generations).where(eq(generations.id, generationId));
    expect(g.summariesStatus).toBe('cancelled');
  });
});
