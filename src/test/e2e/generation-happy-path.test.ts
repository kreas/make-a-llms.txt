import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Readable } from 'node:stream';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { users, generations, sites } from '@/db/schema';
import { eq } from 'drizzle-orm';

const { startMock, sentEmails, MockResend, fetchPageMd, loadSitemap, blobPuts } = vi.hoisted(() => {
  const sentEmails: Record<string, unknown>[] = [];
  function MockResend(this: { emails: { send: (m: Record<string, unknown>) => Promise<void> } }) {
    this.emails = { send: async (m: Record<string, unknown>) => { sentEmails.push(m); } };
  }
  const startMock = vi.fn(async () => ({ runId: 'wf-1' }));
  const fetchPageMd = vi.fn();
  const loadSitemap = vi.fn();
  const blobPuts: Array<{ path: string; body: unknown }> = [];
  return { startMock, sentEmails, MockResend, fetchPageMd, loadSitemap, blobPuts };
});

vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }));
vi.mock('workflow/api', () => ({ start: startMock }));
vi.mock('execa', () => ({
  execa: vi.fn(() => {
    const p: any = Promise.resolve({ stdout: '# fixture\n', stderr: '', exitCode: 0 });
    p.stdout = Readable.from([Buffer.from('# fixture\n')]);
    p.stderr = Readable.from([]);
    return p;
  }),
}));
vi.mock('@/lib/blob', () => ({
  put: vi.fn(async (path: string, body: unknown) => {
    blobPuts.push({ path, body });
    return { url: `https://blob.test/${path}`, pathname: path };
  }),
  get: vi.fn(async (path: string) => {
    const cleanPath = path.startsWith('http://') || path.startsWith('https://') 
      ? new URL(path).pathname.substring(1) 
      : path;
    const found = blobPuts.find(b => b.path === cleanPath);
    if (found) {
      const content = typeof found.body === 'string' ? found.body : JSON.stringify(found.body);
      return { stream: new Response(content).body };
    }
    return null;
  }),
}));
vi.mock('@/lib/sitemap-discover', () => ({
  discoverSitemap: vi.fn(async () => 'https://acme.com/sitemap.xml'),
}));
vi.mock('@/lib/markdown-pages/sitemap-urls', () => ({ loadSitemapUrls: loadSitemap }));
vi.mock('@/lib/markdown-pages/cloudflare', () => ({
  fetchPageMarkdown: fetchPageMd,
  CfClientError: class extends Error { kind = 'transient' as const; },
}));
vi.mock('resend', () => ({ Resend: MockResend }));

import { POST as POST_GENERATIONS } from '@/app/api/generations/route';
import { generateSiteFilesWorkflow } from '@/lib/workflow/generate-site-files';
import { getCurrentUser } from '@/lib/auth';
import { readPageMarkdown, readPageManifest } from '@/lib/services/generations';

describe('generation happy path', () => {
  beforeEach(() => {
    sentEmails.length = 0;
    blobPuts.length = 0;
    fetchPageMd.mockReset();
    fetchPageMd.mockResolvedValue({ markdown: '# page content', durationMs: 10 });
    loadSitemap.mockReset();
    process.env.RESEND_API_KEY = 'test';
    process.env.PUBLIC_BASE_URL = 'http://t';
    process.env.CLOUDFLARE_ACCOUNT_ID = 'acc';
    process.env.CLOUDFLARE_API_TOKEN = 'tok';

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '<html><head><title>Mocked Title</title></head><body><h1>Hello</h1></body></html>',
    } as any));
  });

  it('manual create → workflow → llms files + markdown pages + email', async () => {
    await setupTestDb();
    const [u] = await getDb().insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
    vi.mocked(getCurrentUser).mockResolvedValue(u);

    loadSitemap.mockResolvedValue([
      'https://acme.com/',
      'https://acme.com/docs',
      'https://acme.com/about',
    ]);
    fetchPageMd.mockResolvedValue({ markdown: '# page', durationMs: 5 });

    const res = await POST_GENERATIONS(
      new Request('http://t/api/generations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Acme', rootUrl: 'https://acme.com', notifyEmail: true }),
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    const generationId: number = body.generation.id;

    await generateSiteFilesWorkflow({ generationId });

    const [g] = await getDb().select().from(generations).where(eq(generations.id, generationId));
    const [s] = await getDb().select().from(sites).where(eq(sites.id, g.siteId));
    expect(g.status).toBe('succeeded');
    expect(g.llmsBlobPath).toBe(`projects/${s.uid}/${g.uid}/llms.txt`);
    expect(g.llmsFullBlobPath).toBe(`projects/${s.uid}/${g.uid}/llms-full.txt`);
    expect(g.pagesStatus).toBe('succeeded');
    expect(g.pagesCount).toBe(3);
    expect(g.pagesManifestBlobPath).toBe(`projects/${s.uid}/${g.uid}/pages-manifest.json`);

    // Verify no page files are written during indexing (lazy evaluation)
    let pageWrites = blobPuts.filter((b) => b.path.includes(`projects/${s.uid}/${g.uid}/pages/`));
    expect(pageWrites).toHaveLength(0);

    // Fetch pages to trigger lazy generation
    const s1 = await readPageMarkdown(g.uid, u.id, 'index');
    const s2 = await readPageMarkdown(g.uid, u.id, 'docs');
    const s3 = await readPageMarkdown(g.uid, u.id, 'about');
    expect(await new Response(s1).text()).toContain('# page');
    await new Response(s2).text();
    await new Response(s3).text();

    // Verify pages are now generated and written to R2
    pageWrites = blobPuts.filter((b) => b.path.includes(`projects/${s.uid}/${g.uid}/pages/`));
    expect(pageWrites).toHaveLength(3);

    expect(sentEmails.length).toBe(1);
    expect((sentEmails[0].html as string)).toMatch(/markdown for 3/i);
  });

  it('still succeeds when one CF call fails', async () => {
    await setupTestDb();
    const [u] = await getDb().insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
    vi.mocked(getCurrentUser).mockResolvedValue(u);

    loadSitemap.mockResolvedValue([
      'https://acme.com/a',
      'https://acme.com/b',
      'https://acme.com/c',
    ]);
    fetchPageMd
      .mockResolvedValueOnce({ markdown: '# a', durationMs: 1 })
      .mockRejectedValueOnce(Object.assign(new Error('CF 502'), { kind: 'transient' }))
      .mockResolvedValueOnce({ markdown: '# c', durationMs: 1 });

    const res = await POST_GENERATIONS(
      new Request('http://t/api/generations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Acme', rootUrl: 'https://acme.com', notifyEmail: false }),
      }),
    );
    const { generation } = await res.json();
    await generateSiteFilesWorkflow({ generationId: generation.id });

    const [g] = await getDb().select().from(generations).where(eq(generations.id, generation.id));
    expect(g.status).toBe('succeeded');
    expect(g.pagesStatus).toBe('succeeded');
  });
});
