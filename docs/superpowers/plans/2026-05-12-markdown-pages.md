# Per-Page Markdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-page Markdown rendering branch to the existing generation workflow so every run also produces one `.md` file per sitemap URL via Cloudflare's `browser-rendering/markdown` API, surfaced as an inline tree + preview + zip-download UI on `/g/[id]`.

**Architecture:** Third parallel branch (`runPagesStepSafe`) added to the existing `generateSiteFilesWorkflow`. The branch is *isolated* — its failure cannot fail the overall run. Per-page state lives in a single `pages-manifest.json` blob; only four new pointer columns are added to `generations`. Zip is built on-demand by streaming individual blobs through `archiver`.

**Tech Stack:** Next.js 16 App Router, Drizzle + Turso, Vercel Blob, Vercel Workflow (WDK), TanStack Query, Vitest + RTL. New deps: `archiver`, `react-markdown`, `remark-gfm`.

**Spec:** `docs/superpowers/specs/2026-05-12-markdown-pages-design.md`

---

## Task 1: Schema — four new columns on `generations`

**Files:**
- Modify: `src/db/schema.ts`
- Create (generated): `drizzle/<auto-named>.sql`

- [ ] **Step 1: Add columns to the `generations` table**

Edit `src/db/schema.ts`. Inside the `generations` definition, after `errorMessage`, add:

```ts
    pagesManifestBlobPath: text('pages_manifest_blob_path'),
    pagesCount: integer('pages_count').notNull().default(0),
    pagesStatus: text('pages_status', {
      enum: ['pending', 'running', 'succeeded', 'failed', 'skipped', 'cancelled'],
    })
      .notNull()
      .default('pending'),
    pagesErrorMessage: text('pages_error_message'),
```

- [ ] **Step 2: Generate the migration**

Run: `pnpm db:generate`
Expected: a new file in `drizzle/` containing `ALTER TABLE generations ADD COLUMN ...` statements for all four columns.

- [ ] **Step 3: Apply the migration to the dev DB**

Run: `pnpm db:push`
Expected: no errors. Verify with `pnpm db:studio` that the `generations` table has the four new columns.

- [ ] **Step 4: Run existing tests to confirm nothing regressed**

Run: `pnpm test`
Expected: all existing tests still pass — the new columns have defaults, so existing fixtures don't need to set them.

- [ ] **Step 5: Commit**

```bash
git add src/db/schema.ts drizzle/
git commit -m "feat(db): add per-page markdown columns to generations"
```

---

## Task 2: `url-to-path` mapping

**Files:**
- Create: `src/lib/markdown-pages/url-to-path.ts`
- Test: `src/lib/markdown-pages/url-to-path.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/markdown-pages/url-to-path.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mapUrlsToPaths } from './url-to-path';

describe('mapUrlsToPaths', () => {
  const root = 'https://example.com';

  it('maps / to index.md', () => {
    const out = mapUrlsToPaths(['https://example.com/'], root);
    expect(out[0]).toMatchObject({ path: 'index', filename: 'index.md', status: 'ok' });
  });

  it('drops query string and fragment', () => {
    const out = mapUrlsToPaths(['https://example.com/docs/cdn?x=1#top'], root);
    expect(out[0]).toMatchObject({ path: 'docs/cdn', filename: 'cdn.md' });
  });

  it('rewrites .html and .htm to .md', () => {
    const out = mapUrlsToPaths(
      ['https://example.com/a.html', 'https://example.com/b.htm'],
      root,
    );
    expect(out[0].filename).toBe('a.md');
    expect(out[1].filename).toBe('b.md');
  });

  it('marks cross-origin urls as skipped', () => {
    const out = mapUrlsToPaths(['https://other.com/page'], root);
    expect(out[0]).toMatchObject({ status: 'skipped', reason: 'cross-origin' });
  });

  it('deduplicates identical urls', () => {
    const out = mapUrlsToPaths(
      ['https://example.com/a', 'https://example.com/a/'],
      root,
    );
    expect(out).toHaveLength(1);
  });

  it('suffixes collisions deterministically', () => {
    const out = mapUrlsToPaths(
      ['https://example.com/Foo', 'https://example.com/foo'],
      root,
    );
    expect(out.map((e) => e.path).sort()).toEqual(['Foo', 'foo']);
  });

  it('sanitizes unsafe segments', () => {
    const out = mapUrlsToPaths(['https://example.com/a%20b/c..d'], root);
    expect(out[0].path).toBe('a-b/c-d');
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `pnpm test src/lib/markdown-pages/url-to-path.test.ts`
Expected: FAIL with module not found.

- [ ] **Step 3: Implement `url-to-path.ts`**

Create `src/lib/markdown-pages/url-to-path.ts`:

```ts
export type MappedUrl =
  | { url: string; path: string; filename: string; status: 'ok' }
  | { url: string; path: null; filename: null; status: 'skipped'; reason: string };

const SAFE = /[^A-Za-z0-9._-]+/g;

function sanitizeSegment(seg: string): string {
  const decoded = (() => {
    try {
      return decodeURIComponent(seg);
    } catch {
      return seg;
    }
  })();
  const stripped = decoded.replace(/\.+/g, '.').replace(/^\.+|\.+$/g, '');
  return stripped.replace(SAFE, '-').replace(/^-+|-+$/g, '');
}

function normalizeUrl(input: string): string | null {
  try {
    const u = new URL(input);
    u.hash = '';
    u.search = '';
    let pathname = u.pathname.replace(/\/+$/, '');
    if (pathname === '') pathname = '/';
    return `${u.origin}${pathname}`;
  } catch {
    return null;
  }
}

export function mapUrlsToPaths(urls: string[], rootUrl: string): MappedUrl[] {
  const rootOrigin = new URL(rootUrl).origin;
  const seen = new Map<string, MappedUrl>();
  const usedPaths = new Set<string>();

  for (const raw of urls) {
    const normalized = normalizeUrl(raw);
    if (!normalized) {
      if (!seen.has(raw)) {
        seen.set(raw, { url: raw, path: null, filename: null, status: 'skipped', reason: 'invalid-url' });
      }
      continue;
    }
    if (seen.has(normalized)) continue;

    const u = new URL(normalized);
    if (u.origin !== rootOrigin) {
      seen.set(normalized, {
        url: normalized,
        path: null,
        filename: null,
        status: 'skipped',
        reason: 'cross-origin',
      });
      continue;
    }

    const pathname = u.pathname === '/' ? '/index' : u.pathname.replace(/\.(html?|HTML?)$/, '');
    const segments = pathname.split('/').filter(Boolean).map(sanitizeSegment).filter(Boolean);
    let basePath = segments.join('/');
    if (basePath === '') basePath = 'index';

    let unique = basePath;
    let n = 1;
    while (usedPaths.has(unique)) {
      unique = `${basePath}-${n++}`;
    }
    usedPaths.add(unique);

    const filename = `${unique.split('/').pop()!}.md`;
    seen.set(normalized, { url: normalized, path: unique, filename, status: 'ok' });
  }
  return Array.from(seen.values());
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/lib/markdown-pages/url-to-path.test.ts`
Expected: PASS — all 7 cases.

- [ ] **Step 5: Commit**

```bash
git add src/lib/markdown-pages/url-to-path.ts src/lib/markdown-pages/url-to-path.test.ts
git commit -m "feat(lib): url→path mapping for per-page markdown"
```

---

## Task 3: Sitemap URL loader + cap check

**Files:**
- Create: `src/lib/markdown-pages/sitemap-urls.ts`
- Test: `src/lib/markdown-pages/sitemap-urls.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/markdown-pages/sitemap-urls.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadSitemapUrls } from './sitemap-urls';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

const URLSET = (urls: string[]) =>
  `<?xml version="1.0" encoding="UTF-8"?><urlset>${urls.map((u) => `<url><loc>${u}</loc></url>`).join('')}</urlset>`;
const INDEX = (sitemaps: string[]) =>
  `<?xml version="1.0" encoding="UTF-8"?><sitemapindex>${sitemaps.map((u) => `<sitemap><loc>${u}</loc></sitemap>`).join('')}</sitemapindex>`;

function okResponse(body: string): Response {
  return new Response(body, { status: 200 });
}

describe('loadSitemapUrls', () => {
  beforeEach(() => fetchMock.mockReset());

  it('parses a flat urlset', async () => {
    fetchMock.mockResolvedValueOnce(okResponse(URLSET(['https://a.test/x', 'https://a.test/y'])));
    const out = await loadSitemapUrls('https://a.test/sitemap.xml');
    expect(out).toEqual(['https://a.test/x', 'https://a.test/y']);
  });

  it('follows a sitemap index one level deep', async () => {
    fetchMock
      .mockResolvedValueOnce(okResponse(INDEX(['https://a.test/s1.xml', 'https://a.test/s2.xml'])))
      .mockResolvedValueOnce(okResponse(URLSET(['https://a.test/x'])))
      .mockResolvedValueOnce(okResponse(URLSET(['https://a.test/y'])));
    const out = await loadSitemapUrls('https://a.test/sitemap.xml');
    expect(out.sort()).toEqual(['https://a.test/x', 'https://a.test/y']);
  });

  it('throws when the sitemap fetch fails', async () => {
    fetchMock.mockResolvedValueOnce(new Response('nope', { status: 404 }));
    await expect(loadSitemapUrls('https://a.test/sitemap.xml')).rejects.toThrow(/404/);
  });

  it('returns urls in insertion order, deduped', async () => {
    fetchMock.mockResolvedValueOnce(okResponse(URLSET(['https://a.test/x', 'https://a.test/x'])));
    const out = await loadSitemapUrls('https://a.test/sitemap.xml');
    expect(out).toEqual(['https://a.test/x']);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `pnpm test src/lib/markdown-pages/sitemap-urls.test.ts`
Expected: FAIL with module not found.

- [ ] **Step 3: Implement `sitemap-urls.ts`**

Create `src/lib/markdown-pages/sitemap-urls.ts`:

```ts
const LOC_RE = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;

function extractLocs(xml: string): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = LOC_RE.exec(xml)) !== null) {
    out.push(m[1]);
  }
  return out;
}

async function fetchXml(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`sitemap fetch failed (${res.status}) for ${url}`);
  return res.text();
}

export async function loadSitemapUrls(sitemapUrl: string): Promise<string[]> {
  const xml = await fetchXml(sitemapUrl);
  if (/<sitemapindex[\s>]/i.test(xml)) {
    const childSitemaps = extractLocs(xml);
    const all: string[] = [];
    for (const child of childSitemaps) {
      const childXml = await fetchXml(child);
      all.push(...extractLocs(childXml));
    }
    return Array.from(new Set(all));
  }
  return Array.from(new Set(extractLocs(xml)));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/lib/markdown-pages/sitemap-urls.test.ts`
Expected: PASS — 4 cases.

- [ ] **Step 5: Commit**

```bash
git add src/lib/markdown-pages/sitemap-urls.ts src/lib/markdown-pages/sitemap-urls.test.ts
git commit -m "feat(lib): sitemap URL loader with index recursion"
```

---

## Task 4: Manifest helpers

**Files:**
- Create: `src/lib/markdown-pages/manifest.ts`
- Test: `src/lib/markdown-pages/manifest.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/markdown-pages/manifest.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildManifest, type PageResult, type ManifestInput } from './manifest';

describe('buildManifest', () => {
  const input: ManifestInput = {
    generationId: 42,
    siteRootUrl: 'https://example.com',
    sitemapUrl: 'https://example.com/sitemap.xml',
    generatedAt: '2026-05-12T14:23:00Z',
  };

  it('counts ok / failed / skipped', () => {
    const results: PageResult[] = [
      { url: 'https://example.com/a', path: 'a', filename: 'a.md', status: 'ok', blobPath: 'gens/42/pages/a.md', bytes: 10, durationMs: 100 },
      { url: 'https://example.com/b', path: 'b', filename: 'b.md', status: 'failed', blobPath: null, reason: 'CF 502', durationMs: 4200 },
      { url: 'https://other.com/c', path: null, filename: null, status: 'skipped', blobPath: null, reason: 'cross-origin', durationMs: 0 },
    ];
    const m = buildManifest(input, results);
    expect(m).toMatchObject({
      version: 1,
      generationId: 42,
      totalUrls: 3,
      successCount: 1,
      failedCount: 1,
      skippedCount: 1,
    });
    expect(m.pages).toHaveLength(3);
  });

  it('produces stable JSON', () => {
    const m = buildManifest(input, []);
    expect(JSON.parse(JSON.stringify(m))).toEqual(m);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `pnpm test src/lib/markdown-pages/manifest.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `manifest.ts`**

Create `src/lib/markdown-pages/manifest.ts`:

```ts
export type PageStatus = 'ok' | 'failed' | 'skipped';

export type PageResult =
  | {
      url: string;
      path: string;
      filename: string;
      status: 'ok';
      blobPath: string;
      bytes: number;
      durationMs: number;
    }
  | {
      url: string;
      path: string | null;
      filename: string | null;
      status: 'failed' | 'skipped';
      blobPath: null;
      reason: string;
      durationMs: number;
    };

export type ManifestInput = {
  generationId: number;
  siteRootUrl: string;
  sitemapUrl: string;
  generatedAt: string;
};

export type Manifest = ManifestInput & {
  version: 1;
  totalUrls: number;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  pages: PageResult[];
};

export function buildManifest(input: ManifestInput, pages: PageResult[]): Manifest {
  let ok = 0, failed = 0, skipped = 0;
  for (const p of pages) {
    if (p.status === 'ok') ok++;
    else if (p.status === 'failed') failed++;
    else skipped++;
  }
  return {
    version: 1,
    ...input,
    totalUrls: pages.length,
    successCount: ok,
    failedCount: failed,
    skippedCount: skipped,
    pages,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/lib/markdown-pages/manifest.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/markdown-pages/manifest.ts src/lib/markdown-pages/manifest.test.ts
git commit -m "feat(lib): manifest builder for per-page markdown"
```

---

## Task 5: Concurrency pool

**Files:**
- Create: `src/lib/markdown-pages/pool.ts`
- Test: `src/lib/markdown-pages/pool.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/markdown-pages/pool.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { runWithPool } from './pool';

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe('runWithPool', () => {
  it('processes every item exactly once', async () => {
    const items = [1, 2, 3, 4, 5];
    const handler = vi.fn(async (n: number) => n * 2);
    const out = await runWithPool(items, handler, { concurrency: 2 });
    expect(handler).toHaveBeenCalledTimes(5);
    expect(out.sort((a, b) => a - b)).toEqual([2, 4, 6, 8, 10]);
  });

  it('respects the concurrency limit', async () => {
    let active = 0, peak = 0;
    await runWithPool(
      [1, 2, 3, 4, 5, 6, 7, 8],
      async () => {
        active++;
        peak = Math.max(peak, active);
        await delay(10);
        active--;
      },
      { concurrency: 3 },
    );
    expect(peak).toBeLessThanOrEqual(3);
  });

  it('captures per-item errors without aborting siblings', async () => {
    const out = await runWithPool(
      [1, 2, 3],
      async (n) => {
        if (n === 2) throw new Error('boom');
        return n;
      },
      { concurrency: 2 },
    );
    expect(out).toContain(1);
    expect(out).toContain(3);
    expect(out.find((r) => r instanceof Error)).toBeInstanceOf(Error);
  });

  it('stops issuing new work when isCancelled returns true', async () => {
    const handler = vi.fn(async (n: number) => n);
    let count = 0;
    await runWithPool([1, 2, 3, 4, 5, 6, 7, 8], handler, {
      concurrency: 2,
      isCancelled: () => ++count > 4,
    });
    expect(handler.mock.calls.length).toBeLessThan(8);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `pnpm test src/lib/markdown-pages/pool.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `pool.ts`**

Create `src/lib/markdown-pages/pool.ts`:

```ts
export type PoolOptions = {
  concurrency: number;
  isCancelled?: () => boolean | Promise<boolean>;
};

export async function runWithPool<T, R>(
  items: T[],
  handler: (item: T, index: number) => Promise<R>,
  opts: PoolOptions,
): Promise<(R | Error)[]> {
  const results = new Array<R | Error>(items.length);
  let next = 0;
  const inflight = new Set<Promise<void>>();

  const spawn = (): void => {
    if (next >= items.length) return;
    const idx = next++;
    const p = (async () => {
      try {
        results[idx] = await handler(items[idx], idx);
      } catch (err) {
        results[idx] = err instanceof Error ? err : new Error(String(err));
      }
    })().finally(() => {
      inflight.delete(p);
    });
    inflight.add(p);
  };

  while (next < items.length) {
    if (opts.isCancelled && (await opts.isCancelled())) break;
    while (inflight.size < opts.concurrency && next < items.length) spawn();
    await Promise.race(inflight);
  }
  await Promise.all(inflight);
  return results.filter((r) => r !== undefined) as (R | Error)[];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/lib/markdown-pages/pool.test.ts`
Expected: PASS — 4 cases.

- [ ] **Step 5: Commit**

```bash
git add src/lib/markdown-pages/pool.ts src/lib/markdown-pages/pool.test.ts
git commit -m "feat(lib): bounded async pool with cancellation"
```

---

## Task 6: Cloudflare API client

**Files:**
- Create: `src/lib/markdown-pages/cloudflare.ts`
- Test: `src/lib/markdown-pages/cloudflare.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/markdown-pages/cloudflare.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchPageMarkdown, CfClientError } from './cloudflare';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

beforeEach(() => {
  fetchMock.mockReset();
  process.env.CLOUDFLARE_ACCOUNT_ID = 'acc';
  process.env.CLOUDFLARE_API_TOKEN = 'tok';
});

function ok(markdown: string): Response {
  return new Response(JSON.stringify({ success: true, result: markdown }), { status: 200 });
}

describe('fetchPageMarkdown', () => {
  it('returns markdown on 200 success', async () => {
    fetchMock.mockResolvedValueOnce(ok('# Hello'));
    const out = await fetchPageMarkdown('https://x.test/a');
    expect(out.markdown).toBe('# Hello');
    expect(out.durationMs).toBeGreaterThanOrEqual(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries on 5xx and succeeds on second attempt', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('boom', { status: 502 }))
      .mockResolvedValueOnce(ok('# Hello'));
    const out = await fetchPageMarkdown('https://x.test/a', { backoff: () => 0 });
    expect(out.markdown).toBe('# Hello');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws transient CfClientError after exhausting retries on 429', async () => {
    fetchMock.mockResolvedValue(new Response('rl', { status: 429 }));
    await expect(
      fetchPageMarkdown('https://x.test/a', { backoff: () => 0, maxAttempts: 2 }),
    ).rejects.toMatchObject({ kind: 'transient' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws fatal CfClientError on 401 with no retry', async () => {
    fetchMock.mockResolvedValueOnce(new Response('no', { status: 401 }));
    await expect(
      fetchPageMarkdown('https://x.test/a', { backoff: () => 0 }),
    ).rejects.toMatchObject({ kind: 'fatal' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws fatal when env vars are missing', async () => {
    delete process.env.CLOUDFLARE_API_TOKEN;
    await expect(fetchPageMarkdown('https://x.test/a')).rejects.toMatchObject({ kind: 'fatal' });
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `pnpm test src/lib/markdown-pages/cloudflare.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `cloudflare.ts`**

Create `src/lib/markdown-pages/cloudflare.ts`:

```ts
export type CfErrorKind = 'transient' | 'fatal';

export class CfClientError extends Error {
  readonly kind: CfErrorKind;
  constructor(message: string, kind: CfErrorKind) {
    super(message);
    this.name = 'CfClientError';
    this.kind = kind;
  }
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BACKOFFS_MS = [1000, 3000];

export type FetchOptions = {
  timeoutMs?: number;
  maxAttempts?: number;
  backoff?: (attempt: number) => number;
};

export async function fetchPageMarkdown(
  url: string,
  opts: FetchOptions = {},
): Promise<{ markdown: string; durationMs: number }> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !token) {
    throw new CfClientError('Cloudflare credentials missing', 'fatal');
  }

  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/browser-rendering/markdown`;
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const backoff = opts.backoff ?? ((attempt: number) => DEFAULT_BACKOFFS_MS[attempt - 1] ?? 0);

  let lastErr: CfClientError | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const started = Date.now();
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ url }),
        signal: controller.signal,
      });
      clearTimeout(t);

      if (res.ok) {
        const body = (await res.json()) as { success: boolean; result?: string };
        if (!body.success || typeof body.result !== 'string') {
          throw new CfClientError(`CF returned success=false`, 'transient');
        }
        return { markdown: body.result, durationMs: Date.now() - started };
      }

      const status = res.status;
      if (status === 429 || (status >= 500 && status < 600)) {
        const retryAfter = Number(res.headers.get('retry-after')) || 0;
        lastErr = new CfClientError(`CF ${status}`, 'transient');
        const wait = Math.min(retryAfter * 1000, 10_000) || backoff(attempt);
        if (attempt < maxAttempts && wait > 0) await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      throw new CfClientError(`CF ${status}`, 'fatal');
    } catch (err) {
      clearTimeout(t);
      if (err instanceof CfClientError) {
        if (err.kind === 'fatal') throw err;
        lastErr = err;
      } else if ((err as Error)?.name === 'AbortError') {
        lastErr = new CfClientError('CF timeout', 'transient');
      } else {
        lastErr = new CfClientError(`CF network: ${(err as Error)?.message ?? String(err)}`, 'transient');
      }
      const wait = backoff(attempt);
      if (attempt < maxAttempts && wait > 0) await new Promise((r) => setTimeout(r, wait));
    }
  }

  throw lastErr ?? new CfClientError('CF unknown', 'transient');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/lib/markdown-pages/cloudflare.test.ts`
Expected: PASS — 5 cases.

- [ ] **Step 5: Commit**

```bash
git add src/lib/markdown-pages/cloudflare.ts src/lib/markdown-pages/cloudflare.test.ts
git commit -m "feat(lib): Cloudflare browser-rendering markdown client"
```

---

## Task 7: Extend `prepareStep` to return `rootUrl`

**Files:**
- Modify: `src/lib/workflow/steps.ts`
- Modify: `src/lib/workflow/steps.test.ts`
- Modify: `src/lib/workflow/generate-site-files.ts`

- [ ] **Step 1: Update the existing test**

In `src/lib/workflow/steps.test.ts`, change the assertion in the "prepareStep flips status to running and resolves sitemap" test to also assert `rootUrl`:

```ts
  it('prepareStep flips status to running and resolves sitemap', async () => {
    const out = await prepareStep(generationId);
    expect(out.sitemapUrl).toBe('https://x.test/sitemap.xml');
    expect(out.rootUrl).toBe('https://x.test');
    const [g] = await getDb().select().from(generations).where(eq(generations.id, generationId));
    expect(g.status).toBe('running');
    expect(g.startedAt).not.toBeNull();
    expect(g.resolvedSitemapUrl).toBe('https://x.test/sitemap.xml');
  });
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `pnpm test src/lib/workflow/steps.test.ts -t "prepareStep flips"`
Expected: FAIL — `out.rootUrl` is undefined.

- [ ] **Step 3: Change `prepareStep` to return `rootUrl`**

In `src/lib/workflow/steps.ts`, edit `prepareStep`:

```ts
export async function prepareStep(
  generationId: number,
): Promise<{ sitemapUrl: string; rootUrl: string }> {
  'use step';
  const db = getDb();
  const [g] = await db.select().from(generations).where(eq(generations.id, generationId));
  if (!g) throw new Error(`generation ${generationId} not found`);
  const [s] = await db.select().from(sites).where(eq(sites.id, g.siteId));
  if (!s) throw new Error(`site ${g.siteId} not found`);

  const sitemapUrl = s.sitemapUrl ?? (await discoverSitemap(s.rootUrl));

  await db
    .update(generations)
    .set({
      status: 'running',
      startedAt: g.startedAt ?? nowIso(),
      resolvedSitemapUrl: sitemapUrl,
      updatedAt: nowIso(),
    })
    .where(eq(generations.id, generationId));

  return { sitemapUrl, rootUrl: s.rootUrl };
}
```

- [ ] **Step 4: Update the workflow caller**

In `src/lib/workflow/generate-site-files.ts`, change the prepare destructure:

```ts
    const { sitemapUrl, rootUrl } = await prepareStep(generationId);
```

(Leave the rest of the workflow body unchanged for now — Task 9 wires the new branch.)

- [ ] **Step 5: Run tests**

Run: `pnpm test src/lib/workflow`
Expected: all existing workflow tests still PASS, including the updated prepare test. `rootUrl` is now unused in the workflow body — this is OK; TS would only complain on `noUnusedLocals`. Confirm `pnpm lint` is clean.

Run: `pnpm lint`
Expected: PASS (or, if it complains about unused `rootUrl`, swap to `const { sitemapUrl /* rootUrl unused until Task 9 */ } = await prepareStep(generationId);` for the moment).

- [ ] **Step 6: Commit**

```bash
git add src/lib/workflow/steps.ts src/lib/workflow/steps.test.ts src/lib/workflow/generate-site-files.ts
git commit -m "feat(workflow): prepareStep returns rootUrl for downstream branches"
```

---

## Task 8: `runPagesStepSafe` and DB-marker helpers

**Files:**
- Modify: `src/lib/workflow/steps.ts`
- Modify: `src/lib/workflow/steps.test.ts`

- [ ] **Step 1: Write failing tests**

Append the following cases to the `describe('workflow steps', …)` block in `src/lib/workflow/steps.test.ts`. Mock the CF client and blob put at the top of the file. Add these mocks near the existing `vi.mock` calls:

```ts
vi.mock('@/lib/markdown-pages/cloudflare', () => ({
  fetchPageMarkdown: vi.fn(),
  CfClientError: class extends Error { kind = 'transient' as const; },
}));
vi.mock('@/lib/markdown-pages/sitemap-urls', () => ({
  loadSitemapUrls: vi.fn(),
}));
```

Then import them and add the imports:

```ts
import { fetchPageMarkdown } from '@/lib/markdown-pages/cloudflare';
import { loadSitemapUrls } from '@/lib/markdown-pages/sitemap-urls';
import { runPagesStepSafe } from './steps';
```

Append these test cases inside the `describe('workflow steps', ...)`:

```ts
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
    expect(g.pagesManifestBlobPath).toBe(`gens/${generationId}/pages-manifest.json`);
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
  });
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `pnpm test src/lib/workflow/steps.test.ts -t "runPagesStepSafe"`
Expected: FAIL — `runPagesStepSafe` is not exported.

- [ ] **Step 3: Implement `runPagesStepSafe` and its helpers**

In `src/lib/workflow/steps.ts`, add imports at the top:

```ts
import { put } from '@vercel/blob';
import { fetchPageMarkdown, CfClientError } from '@/lib/markdown-pages/cloudflare';
import { loadSitemapUrls } from '@/lib/markdown-pages/sitemap-urls';
import { mapUrlsToPaths } from '@/lib/markdown-pages/url-to-path';
import { buildManifest, type PageResult } from '@/lib/markdown-pages/manifest';
import { runWithPool } from '@/lib/markdown-pages/pool';
```

Append the new step and helpers at the bottom of the file:

```ts
const PAGES_CAP = Number(process.env.PAGES_PER_RUN_CAP ?? 250);
const PAGES_CONCURRENCY = Number(process.env.CLOUDFLARE_BR_CONCURRENCY ?? 5);

async function readCancelled(generationId: number): Promise<boolean> {
  const [g] = await getDb().select().from(generations).where(eq(generations.id, generationId));
  return g?.status === 'cancelled';
}

async function markPagesStatus(
  generationId: number,
  fields: Partial<{
    pagesStatus: 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped' | 'cancelled';
    pagesCount: number;
    pagesManifestBlobPath: string | null;
    pagesErrorMessage: string | null;
  }>,
): Promise<void> {
  await getDb()
    .update(generations)
    .set({ ...fields, updatedAt: nowIso() })
    .where(eq(generations.id, generationId));
}

function frontmatter(url: string, generatedAt: string): string {
  return `---\nsource: ${url}\ngenerated_at: ${generatedAt}\n---\n\n`;
}

export async function runPagesStepSafe(
  generationId: number,
  sitemapUrl: string,
  rootUrl: string,
): Promise<void> {
  'use step';
  try {
    await markPagesStatus(generationId, { pagesStatus: 'running' });

    const rawUrls = await loadSitemapUrls(sitemapUrl);
    if (rawUrls.length === 0) {
      return markPagesStatus(generationId, {
        pagesStatus: 'skipped',
        pagesErrorMessage: 'no URLs in sitemap',
      });
    }
    if (rawUrls.length > PAGES_CAP) {
      return markPagesStatus(generationId, {
        pagesStatus: 'skipped',
        pagesErrorMessage: `sitemap has ${rawUrls.length} URLs (cap ${PAGES_CAP})`,
      });
    }
    if (!process.env.CLOUDFLARE_ACCOUNT_ID || !process.env.CLOUDFLARE_API_TOKEN) {
      return markPagesStatus(generationId, {
        pagesStatus: 'failed',
        pagesErrorMessage: 'Cloudflare credentials missing',
      });
    }

    const mapped = mapUrlsToPaths(rawUrls, rootUrl);
    const generatedAt = nowIso();
    const eligible = mapped.filter((m) => m.status === 'ok');
    const skipped: PageResult[] = mapped
      .filter((m) => m.status === 'skipped')
      .map((m) => ({
        url: m.url,
        path: null,
        filename: null,
        status: 'skipped' as const,
        blobPath: null,
        reason: 'reason' in m ? m.reason : 'skipped',
        durationMs: 0,
      }));

    const results = await runWithPool(
      eligible,
      async (entry): Promise<PageResult> => {
        if (entry.status !== 'ok') {
          return {
            url: entry.url,
            path: null,
            filename: null,
            status: 'failed',
            blobPath: null,
            reason: 'unmapped',
            durationMs: 0,
          };
        }
        try {
          const { markdown, durationMs } = await fetchPageMarkdown(entry.url);
          const body = frontmatter(entry.url, generatedAt) + markdown;
          const bytes = Buffer.byteLength(body, 'utf8');
          const blobPath = `gens/${generationId}/pages/${entry.path}.md`;
          await put(blobPath, body, {
            access: 'private',
            contentType: 'text/markdown; charset=utf-8',
            addRandomSuffix: false,
            allowOverwrite: true,
          });
          return {
            url: entry.url,
            path: entry.path,
            filename: entry.filename,
            status: 'ok',
            blobPath,
            bytes,
            durationMs,
          };
        } catch (err) {
          const reason =
            err instanceof CfClientError
              ? err.message
              : (err as Error)?.message ?? String(err);
          return {
            url: entry.url,
            path: entry.path,
            filename: entry.filename,
            status: 'failed',
            blobPath: null,
            reason,
            durationMs: 0,
          };
        }
      },
      {
        concurrency: PAGES_CONCURRENCY,
        isCancelled: () => readCancelled(generationId),
      },
    );

    const pageResults: PageResult[] = [
      ...skipped,
      ...(results.filter((r) => !(r instanceof Error)) as PageResult[]),
    ];

    const manifest = buildManifest(
      {
        generationId,
        siteRootUrl: rootUrl,
        sitemapUrl,
        generatedAt,
      },
      pageResults,
    );

    const manifestPath = `gens/${generationId}/pages-manifest.json`;
    await put(manifestPath, JSON.stringify(manifest), {
      access: 'private',
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: true,
    });

    if (await readCancelled(generationId)) {
      return markPagesStatus(generationId, {
        pagesStatus: 'cancelled',
        pagesCount: pageResults.length,
        pagesManifestBlobPath: manifestPath,
      });
    }

    return markPagesStatus(generationId, {
      pagesStatus: 'succeeded',
      pagesCount: pageResults.length,
      pagesManifestBlobPath: manifestPath,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return markPagesStatus(generationId, {
      pagesStatus: 'failed',
      pagesErrorMessage: message.slice(0, 500),
    });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/lib/workflow/steps.test.ts`
Expected: PASS — all existing cases plus the 5 new `runPagesStepSafe` cases.

- [ ] **Step 5: Commit**

```bash
git add src/lib/workflow/steps.ts src/lib/workflow/steps.test.ts
git commit -m "feat(workflow): runPagesStepSafe per-page markdown branch"
```

---

## Task 9: Wire the third parallel branch into the workflow

**Files:**
- Modify: `src/lib/workflow/generate-site-files.ts`

- [ ] **Step 1: Update the workflow body**

Replace the workflow function in `src/lib/workflow/generate-site-files.ts`:

```ts
import {
  prepareStep,
  runGenStep,
  runFullStep,
  runPagesStepSafe,
  completeStep,
  notifyStep,
  failStep,
} from './steps';

export type GenerateSiteFilesPayload = { generationId: number };

export async function generateSiteFilesWorkflow({
  generationId,
}: GenerateSiteFilesPayload): Promise<{ ok: boolean }> {
  'use workflow';

  console.log(`[workflow] generateSiteFiles start id=${generationId}`);
  try {
    const { sitemapUrl, rootUrl } = await prepareStep(generationId);

    await Promise.all([
      runGenStep(generationId, sitemapUrl),
      runFullStep(generationId, sitemapUrl),
      runPagesStepSafe(generationId, sitemapUrl, rootUrl),
    ]);

    await completeStep(generationId);
    await notifyStep(generationId);
    console.log(`[workflow] generateSiteFiles ok id=${generationId}`);
    return { ok: true };
  } catch (err) {
    const stepName = inferStepName(err);
    console.error(
      `[workflow] generateSiteFiles fail id=${generationId} step=${stepName}`,
      err,
    );
    await failStep(generationId, stepName, err);
    return { ok: false };
  }
}

function inferStepName(err: unknown): string {
  if (err instanceof Error && err.message) {
    if (/sitemap/i.test(err.message)) return 'prepare';
    if (/llms-full|gen-full/i.test(err.message)) return 'runFull';
    if (/llms\.txt|\bgen\b/i.test(err.message)) return 'runGen';
  }
  return 'workflow';
}
```

(`runPagesStepSafe` is deliberately not in `inferStepName` because it never throws — failures there don't bubble.)

- [ ] **Step 2: Run all workflow tests**

Run: `pnpm test src/lib/workflow`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/workflow/generate-site-files.ts
git commit -m "feat(workflow): wire per-page markdown branch into the run"
```

---

## Task 10: Extend SSE stream snapshot with pages fields

**Files:**
- Modify: `src/app/api/generations/[id]/stream/route.ts`
- Modify: `src/app/api/generations/[id]/stream/route.test.ts`

- [ ] **Step 1: Add a failing assertion to the stream test**

The route exports `buildEventStream` directly, which makes it testable without spinning up a Response. Append this case to `src/app/api/generations/[id]/stream/route.test.ts`:

```ts
  it('snapshot includes pages fields', async () => {
    await setupTestDb();
    const db = getDb();
    const [u] = await db.insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
    const [s] = await db
      .insert(sites)
      .values({
        userId: u.id,
        name: 'S',
        rootUrl: 'https://x.test',
        webhookTokenHash: 'a'.repeat(64),
        webhookTokenPrefix: 'lmt_aaaa',
      })
      .returning();
    // status='succeeded' so buildEventStream exits after one tick.
    const [g] = await db
      .insert(generations)
      .values({
        siteId: s.id,
        userId: u.id,
        trigger: 'manual',
        status: 'succeeded',
        pagesStatus: 'running',
        pagesCount: 3,
      })
      .returning();

    const writes: string[] = [];
    await buildEventStream(
      g.id,
      u.id,
      { write: (str) => writes.push(str), close: () => {} },
      { intervalMs: 1, heartbeatMs: 60_000, idleTimeoutMs: 60_000 },
    );

    const statusFrame = writes.find((w) => w.startsWith('event: status'));
    expect(statusFrame).toBeDefined();
    const payload = JSON.parse(statusFrame!.split('data: ')[1].trim());
    expect(payload.pagesStatus).toBe('running');
    expect(payload.pagesCount).toBe(3);
    expect(payload).toHaveProperty('pagesManifestBlobPath');
    expect(payload).toHaveProperty('pagesErrorMessage');
  });
```

Make sure these imports exist at the top of the file (add any that are missing):

```ts
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { users, sites, generations } from '@/db/schema';
import { buildEventStream } from './route';
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `pnpm test src/app/api/generations/[id]/stream/route.test.ts`
Expected: FAIL — payload does not include `pagesStatus`.

- [ ] **Step 3: Extend the snapshot**

In `src/app/api/generations/[id]/stream/route.ts`, update the `snapshot` construction inside `tick()`:

```ts
    const snapshot = JSON.stringify({
      status: row.status,
      llmsBlobPath: row.llmsBlobPath,
      llmsFullBlobPath: row.llmsFullBlobPath,
      errorMessage: row.errorMessage,
      pagesStatus: row.pagesStatus,
      pagesCount: row.pagesCount,
      pagesManifestBlobPath: row.pagesManifestBlobPath,
      pagesErrorMessage: row.pagesErrorMessage,
    });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/app/api/generations/[id]/stream/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/generations/[id]/stream/route.ts src/app/api/generations/[id]/stream/route.test.ts
git commit -m "feat(api): include pages fields in /g/[id] SSE snapshot"
```

---

## Task 11: `GET /api/generations/[id]/pages` — manifest route

**Files:**
- Create: `src/app/api/generations/[id]/pages/route.ts`
- Test: `src/app/api/generations/[id]/pages/route.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/app/api/generations/[id]/pages/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { generations, sites, users } from '@/db/schema';
import { eq } from 'drizzle-orm';

const getBlobSpy = vi.fn();
vi.mock('@vercel/blob', () => ({ get: (...a: any[]) => getBlobSpy(...a) }));
vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }));

import { GET } from './route';
import { getCurrentUser } from '@/lib/auth';

async function seed() {
  await setupTestDb();
  const db = getDb();
  const [u] = await db.insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
  const [s] = await db
    .insert(sites)
    .values({
      userId: u.id,
      name: 'S',
      rootUrl: 'https://x.test',
      webhookTokenHash: 'a'.repeat(64),
      webhookTokenPrefix: 'lmt_aaaa',
    })
    .returning();
  const [g] = await db
    .insert(generations)
    .values({ siteId: s.id, userId: u.id, trigger: 'manual' })
    .returning();
  return { u, s, g };
}

describe('GET /api/generations/[id]/pages', () => {
  beforeEach(() => {
    getBlobSpy.mockReset();
    vi.mocked(getCurrentUser).mockReset();
  });

  it('401 when unauthenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await GET(new Request('http://t'), { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(401);
  });

  it('404 for non-owner', async () => {
    const { g } = await seed();
    const db = getDb();
    const [other] = await db.insert(users).values({ name: 'B', email: 'b@b.test' }).returning();
    vi.mocked(getCurrentUser).mockResolvedValue(other);
    const res = await GET(new Request('http://t'), { params: Promise.resolve({ id: String(g.id) }) });
    expect(res.status).toBe(404);
  });

  it('returns the pending shape when no manifest is written yet', async () => {
    const { u, g } = await seed();
    vi.mocked(getCurrentUser).mockResolvedValue(u);
    const res = await GET(new Request('http://t'), { params: Promise.resolve({ id: String(g.id) }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ status: 'pending', pages: [] });
  });

  it('returns the parsed manifest when written', async () => {
    const { u, g } = await seed();
    vi.mocked(getCurrentUser).mockResolvedValue(u);
    await getDb()
      .update(generations)
      .set({
        pagesStatus: 'succeeded',
        pagesCount: 1,
        pagesManifestBlobPath: `gens/${g.id}/pages-manifest.json`,
      })
      .where(eq(generations.id, g.id));
    getBlobSpy.mockResolvedValueOnce({
      stream: new Response(JSON.stringify({ version: 1, pages: [{ url: 'x' }] })).body,
    });
    const res = await GET(new Request('http://t'), { params: Promise.resolve({ id: String(g.id) }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('succeeded');
    expect(body.pages).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `pnpm test src/app/api/generations/[id]/pages/route.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the route**

Create `src/app/api/generations/[id]/pages/route.ts`:

```ts
import { get } from '@vercel/blob';
import {
  apiErrorResponse,
  ApiError,
  assertOwnsGeneration,
  requireUserOrThrow,
} from '@/lib/auth-guards';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUserOrThrow();
    const { id } = await ctx.params;
    const n = Number(id);
    if (!Number.isInteger(n) || n <= 0) {
      throw new ApiError(404, 'not_found', 'Generation not found');
    }
    const gen = await assertOwnsGeneration(n, user.id);

    if (!gen.pagesManifestBlobPath) {
      return Response.json({
        status: gen.pagesStatus,
        reason: gen.pagesErrorMessage ?? undefined,
        pages: [],
      });
    }

    const blob = await get(gen.pagesManifestBlobPath, { access: 'private' });
    if (!blob) {
      return Response.json({ status: gen.pagesStatus, pages: [] });
    }
    const text = await new Response(blob.stream).text();
    const parsed = JSON.parse(text);
    return Response.json({ status: gen.pagesStatus, ...parsed });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/app/api/generations/[id]/pages/route.test.ts`
Expected: PASS — 4 cases.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/generations/[id]/pages/route.ts src/app/api/generations/[id]/pages/route.test.ts
git commit -m "feat(api): GET manifest route for per-page markdown"
```

---

## Task 12: `GET /api/generations/[id]/pages/[...path]` — single-file route

**Files:**
- Create: `src/app/api/generations/[id]/pages/[...path]/route.ts`
- Test: `src/app/api/generations/[id]/pages/[...path]/route.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/app/api/generations/[id]/pages/[...path]/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { generations, sites, users } from '@/db/schema';
import { eq } from 'drizzle-orm';

const getBlobSpy = vi.fn();
vi.mock('@vercel/blob', () => ({ get: (...a: any[]) => getBlobSpy(...a) }));
vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }));

import { GET } from './route';
import { getCurrentUser } from '@/lib/auth';

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
        stream: new Response(JSON.stringify({ pages: pages.map((pg) => ({ ...pg, status: pg.status })) })).body,
      };
    }
    if (pages.some((pg) => pg.blobPath === p && pg.status === 'ok')) {
      return { stream: new Response('# Hello').body };
    }
    return null;
  });
  return { u, g };
}

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
    const res = await GET(new Request('http://t'), {
      params: Promise.resolve({ id: String(g.id), path: ['docs', 'cdn'] }),
    });
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
    const res = await GET(new Request('http://t'), {
      params: Promise.resolve({ id: String(g.id), path: ['evil'] }),
    });
    expect(res.status).toBe(404);
  });

  it('404 for non-owner', async () => {
    const { g } = await seedWithManifest([
      { path: 'docs/cdn', blobPath: 'gens/x/pages/docs/cdn.md', status: 'ok' },
    ]);
    const db = getDb();
    const [other] = await db.insert(users).values({ name: 'B', email: 'b@b.test' }).returning();
    vi.mocked(getCurrentUser).mockResolvedValue(other);
    const res = await GET(new Request('http://t'), {
      params: Promise.resolve({ id: String(g.id), path: ['docs', 'cdn'] }),
    });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `pnpm test src/app/api/generations/[id]/pages/[...path]/route.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the route**

Create `src/app/api/generations/[id]/pages/[...path]/route.ts`:

```ts
import { get } from '@vercel/blob';
import {
  apiErrorResponse,
  ApiError,
  assertOwnsGeneration,
  requireUserOrThrow,
} from '@/lib/auth-guards';

type Ctx = { params: Promise<{ id: string; path: string[] }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUserOrThrow();
    const { id, path } = await ctx.params;
    const n = Number(id);
    if (!Number.isInteger(n) || n <= 0) {
      throw new ApiError(404, 'not_found', 'Generation not found');
    }
    const gen = await assertOwnsGeneration(n, user.id);

    if (!gen.pagesManifestBlobPath) {
      throw new ApiError(404, 'not_found', 'No pages for this generation');
    }

    const manifestBlob = await get(gen.pagesManifestBlobPath, { access: 'private' });
    if (!manifestBlob) throw new ApiError(404, 'not_found', 'Manifest missing');
    const manifest = JSON.parse(await new Response(manifestBlob.stream).text()) as {
      pages: Array<{ path: string | null; blobPath: string | null; status: string }>;
    };

    const wanted = path.join('/').replace(/\.md$/, '');
    const entry = manifest.pages.find((p) => p.path === wanted && p.status === 'ok');
    if (!entry || !entry.blobPath) {
      throw new ApiError(404, 'not_found', 'Page not found');
    }

    const blob = await get(entry.blobPath, { access: 'private' });
    if (!blob) throw new ApiError(404, 'not_found', 'Page blob missing');

    return new Response(blob.stream, {
      status: 200,
      headers: {
        'content-type': 'text/markdown; charset=utf-8',
        'content-disposition': 'inline',
      },
    });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/app/api/generations/[id]/pages/[...path]/route.test.ts`
Expected: PASS — 3 cases.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/generations/[id]/pages
git commit -m "feat(api): GET single-page markdown route with manifest allowlist"
```

---

## Task 13: `GET /api/generations/[id]/pages.zip` — zip route

**Files:**
- Modify: `package.json` (add dependency)
- Create: `src/app/api/generations/[id]/pages.zip/route.ts`
- Test: `src/app/api/generations/[id]/pages.zip/route.test.ts`

- [ ] **Step 1: Install `archiver`**

Run: `pnpm add archiver && pnpm add -D @types/archiver`
Expected: both packages added to `package.json`.

- [ ] **Step 2: Write failing tests**

Create `src/app/api/generations/[id]/pages.zip/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { generations, sites, users } from '@/db/schema';

const getBlobSpy = vi.fn();
vi.mock('@vercel/blob', () => ({ get: (...a: any[]) => getBlobSpy(...a) }));
vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }));

import { GET } from './route';
import { getCurrentUser } from '@/lib/auth';

async function seed(pages: { path: string; blobPath: string; status: 'ok' | 'failed' }[]) {
  await setupTestDb();
  const db = getDb();
  const [u] = await db.insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
  const [s] = await db
    .insert(sites)
    .values({ userId: u.id, name: 'Acme', rootUrl: 'https://x.test', webhookTokenHash: 'a'.repeat(64), webhookTokenPrefix: 'lmt_aaaa' })
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
      return { stream: new Response(JSON.stringify({ pages })).body };
    }
    return { stream: new Response('# hi').body };
  });
  return { u, g };
}

describe('GET /api/generations/[id]/pages.zip', () => {
  beforeEach(() => {
    getBlobSpy.mockReset();
    vi.mocked(getCurrentUser).mockReset();
  });

  it('streams a zip with correct headers', async () => {
    const { u, g } = await seed([
      { path: 'a', blobPath: 'gens/x/pages/a.md', status: 'ok' },
      { path: 'b', blobPath: 'gens/x/pages/b.md', status: 'failed' },
    ]);
    vi.mocked(getCurrentUser).mockResolvedValue(u);
    const res = await GET(new Request('http://t'), {
      params: Promise.resolve({ id: String(g.id) }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/zip');
    expect(res.headers.get('content-disposition')).toMatch(/attachment;.*\.zip/);
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.length).toBeGreaterThan(0);
    expect(buf.slice(0, 2).toString('binary')).toBe('PK'); // zip magic bytes
  });

  it('404 for non-owner', async () => {
    const { g } = await seed([{ path: 'a', blobPath: 'gens/x/pages/a.md', status: 'ok' }]);
    const db = getDb();
    const [other] = await db.insert(users).values({ name: 'B', email: 'b@b.test' }).returning();
    vi.mocked(getCurrentUser).mockResolvedValue(other);
    const res = await GET(new Request('http://t'), { params: Promise.resolve({ id: String(g.id) }) });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 3: Run the test to confirm it fails**

Run: `pnpm test src/app/api/generations/[id]/pages.zip/route.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implement the zip route**

Create `src/app/api/generations/[id]/pages.zip/route.ts`:

```ts
import { Readable } from 'node:stream';
import archiver from 'archiver';
import { get } from '@vercel/blob';
import {
  apiErrorResponse,
  ApiError,
  assertOwnsGeneration,
  requireUserOrThrow,
} from '@/lib/auth-guards';
import { getDb } from '@/db';
import { sites } from '@/db/schema';
import { eq } from 'drizzle-orm';

type Ctx = { params: Promise<{ id: string }> };

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'site';
}

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUserOrThrow();
    const { id } = await ctx.params;
    const n = Number(id);
    if (!Number.isInteger(n) || n <= 0) {
      throw new ApiError(404, 'not_found', 'Generation not found');
    }
    const gen = await assertOwnsGeneration(n, user.id);

    if (!gen.pagesManifestBlobPath) {
      throw new ApiError(404, 'not_found', 'No pages available');
    }

    const manifestBlob = await get(gen.pagesManifestBlobPath, { access: 'private' });
    if (!manifestBlob) throw new ApiError(404, 'not_found', 'Manifest missing');
    const manifestText = await new Response(manifestBlob.stream).text();
    const manifest = JSON.parse(manifestText) as {
      pages: Array<{ path: string | null; filename: string | null; blobPath: string | null; status: string }>;
    };

    const [site] = await getDb().select().from(sites).where(eq(sites.id, gen.siteId));
    const filename = `${slugify(site?.name ?? 'site')}-pages-${gen.id}.zip`;

    const archive = archiver('zip', { zlib: { level: 6 } });

    archive.append(manifestText, { name: 'manifest.json' });
    for (const entry of manifest.pages) {
      if (entry.status !== 'ok' || !entry.blobPath || !entry.path) continue;
      const pageBlob = await get(entry.blobPath, { access: 'private' });
      if (!pageBlob) continue;
      const buf = Buffer.from(await new Response(pageBlob.stream).arrayBuffer());
      archive.append(buf, { name: `${entry.path}.md` });
    }
    void archive.finalize();

    const webStream = Readable.toWeb(archive) as unknown as ReadableStream<Uint8Array>;

    return new Response(webStream, {
      status: 200,
      headers: {
        'content-type': 'application/zip',
        'content-disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test src/app/api/generations/[id]/pages.zip/route.test.ts`
Expected: PASS — 2 cases.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml src/app/api/generations/[id]/pages.zip
git commit -m "feat(api): on-demand zip of per-page markdown"
```

---

## Task 14: Extend cron `cleanup-orphans` to sweep page blobs

**Files:**
- Modify: `src/app/api/cron/cleanup-orphans/route.ts`
- Modify: `src/app/api/cron/cleanup-orphans/route.test.ts`

- [ ] **Step 1: Add a failing test case**

In `src/app/api/cron/cleanup-orphans/route.test.ts`, add this test case **and** extend the existing `@vercel/blob` mock to expose `list`:

Replace the existing mock at the top of the file with:

```ts
const delSpy = vi.fn(async () => {});
const listSpy = vi.fn(async () => ({ blobs: [] as { pathname: string }[] }));
vi.mock('@vercel/blob', () => ({
  del: (...a: any[]) => delSpy(...a),
  list: (...a: any[]) => listSpy(...a),
}));
```

Add this test inside the existing describe block:

```ts
  it('deletes page blobs and manifest for orphaned generation', async () => {
    await setupTestDb();
    const db = getDb();
    const [u] = await db.insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
    const [s] = await db
      .insert(sites)
      .values({ userId: u.id, name: 'S', rootUrl: 'https://s.test', webhookTokenHash: 'a'.repeat(64), webhookTokenPrefix: 'lmt_aaaa' })
      .returning();
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    await db.insert(generations).values({
      siteId: s.id,
      userId: u.id,
      trigger: 'manual',
      status: 'cancelled',
      pagesStatus: 'cancelled',
      pagesManifestBlobPath: 'gens/1/pages-manifest.json',
      createdAt: old,
      updatedAt: old,
    });

    listSpy.mockResolvedValueOnce({
      blobs: [
        { pathname: 'gens/1/pages/a.md' },
        { pathname: 'gens/1/pages/b.md' },
      ],
    });

    const res = await GET(
      new Request('http://t/api/cron/cleanup-orphans', {
        headers: { authorization: 'Bearer test-secret' },
      }),
    );
    expect(res.status).toBe(200);
    // 2 page blobs + manifest = 3 dels for this row's pages-related blobs.
    const calls = delSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(calls).toMatch(/pages\/a\.md/);
    expect(calls).toMatch(/pages\/b\.md/);
    expect(calls).toMatch(/pages-manifest\.json/);
  });
```

Also extend the existing `or(isNotNull(...))` clause in the existing test to keep it green if the route's WHERE clause also checks the new columns.

- [ ] **Step 2: Run the test to confirm it fails**

Run: `pnpm test src/app/api/cron/cleanup-orphans/route.test.ts`
Expected: FAIL.

- [ ] **Step 3: Extend the route**

In `src/app/api/cron/cleanup-orphans/route.ts`:

```ts
import { and, inArray, lt, isNotNull, or } from 'drizzle-orm';
import { del, list } from '@vercel/blob';
import { getDb } from '@/db';
import { generations } from '@/db/schema';

const ONE_HOUR_MS = 60 * 60 * 1000;

export async function GET(req: Request) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const cutoff = new Date(Date.now() - ONE_HOUR_MS).toISOString();
  const orphans = await getDb()
    .select()
    .from(generations)
    .where(
      and(
        inArray(generations.status, ['cancelled', 'failed']),
        lt(generations.createdAt, cutoff),
        or(
          isNotNull(generations.llmsBlobPath),
          isNotNull(generations.llmsFullBlobPath),
          isNotNull(generations.pagesManifestBlobPath),
        ),
      ),
    );

  let deleted = 0;
  for (const g of orphans) {
    for (const path of [g.llmsBlobPath, g.llmsFullBlobPath, g.pagesManifestBlobPath]) {
      if (!path) continue;
      try {
        await del(`https://blob.vercel-storage.com/${path}`);
        deleted++;
      } catch (err) {
        console.warn('[cron] del failed', path, err);
      }
    }
    try {
      const { blobs } = await list({ prefix: `gens/${g.id}/pages/` });
      for (const b of blobs) {
        try {
          await del(`https://blob.vercel-storage.com/${b.pathname}`);
          deleted++;
        } catch (err) {
          console.warn('[cron] del failed', b.pathname, err);
        }
      }
    } catch (err) {
      console.warn('[cron] list failed', g.id, err);
    }
  }

  return Response.json({ deleted });
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm test src/app/api/cron/cleanup-orphans/route.test.ts`
Expected: PASS — old and new cases.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/cron/cleanup-orphans
git commit -m "feat(ops): cleanup-orphans sweeps per-page markdown blobs"
```

---

## Task 15: `PagesPreview` component

**Files:**
- Modify: `package.json` (add `react-markdown`, `remark-gfm`)
- Create: `src/components/generations/pages-preview.tsx`
- Test: `src/components/generations/pages-preview.test.tsx`

- [ ] **Step 1: Install deps**

Run: `pnpm add react-markdown remark-gfm`
Expected: both added to `package.json`.

- [ ] **Step 2: Write failing tests**

Create `src/components/generations/pages-preview.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PagesPreview } from './pages-preview';

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

describe('PagesPreview', () => {
  it('renders the empty state when no path is selected', () => {
    render(wrap(<PagesPreview generationId={1} selectedPath={null} />));
    expect(screen.getByText(/select a page/i)).toBeInTheDocument();
  });

  it('fetches markdown and renders it', async () => {
    fetchMock.mockResolvedValueOnce(new Response('# Hello\n\nWorld'));
    render(wrap(<PagesPreview generationId={1} selectedPath="docs/cdn" />));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /hello/i })).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/generations/1/pages/docs/cdn');
  });

  it('shows an error state on fetch failure', async () => {
    fetchMock.mockResolvedValueOnce(new Response('nope', { status: 500 }));
    render(wrap(<PagesPreview generationId={1} selectedPath="docs/cdn" />));
    await waitFor(() => expect(screen.getByText(/couldn['’]t load/i)).toBeInTheDocument());
  });
});
```

- [ ] **Step 3: Run the test to confirm it fails**

Run: `pnpm test src/components/generations/pages-preview.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `PagesPreview`**

Create `src/components/generations/pages-preview.tsx`:

```tsx
'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useQuery } from '@tanstack/react-query';

export function PagesPreview({
  generationId,
  selectedPath,
}: {
  generationId: number;
  selectedPath: string | null;
}) {
  const q = useQuery({
    queryKey: ['pageMd', generationId, selectedPath],
    enabled: !!selectedPath,
    queryFn: async () => {
      const res = await fetch(`/api/generations/${generationId}/pages/${selectedPath}`);
      if (!res.ok) throw new Error(`status ${res.status}`);
      return res.text();
    },
    staleTime: 5 * 60 * 1000,
  });

  if (!selectedPath) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-body">
        Select a page on the left to preview.
      </div>
    );
  }
  if (q.isPending) {
    return <div className="p-6 text-body">Loading…</div>;
  }
  if (q.isError) {
    return <div className="p-6 text-body">Couldn’t load this page.</div>;
  }

  return (
    <article className="prose prose-neutral max-w-none p-6 text-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{q.data}</ReactMarkdown>
    </article>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test src/components/generations/pages-preview.test.tsx`
Expected: PASS — 3 cases.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml src/components/generations/pages-preview.tsx src/components/generations/pages-preview.test.tsx
git commit -m "feat(ui): PagesPreview markdown renderer with TanStack Query"
```

---

## Task 16: `PagesTree` component

**Files:**
- Create: `src/components/generations/pages-tree.tsx`
- Test: `src/components/generations/pages-tree.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `src/components/generations/pages-tree.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PagesTree, type ManifestPage } from './pages-tree';

const pages: ManifestPage[] = [
  { url: '', path: 'index', filename: 'index.md', status: 'ok', blobPath: 'x' },
  { url: '', path: 'docs/cdn', filename: 'cdn.md', status: 'ok', blobPath: 'x' },
  { url: '', path: 'docs/cli/deploy', filename: 'deploy.md', status: 'ok', blobPath: 'x' },
  { url: '', path: 'docs/edge', filename: 'edge.md', status: 'failed', blobPath: null, reason: 'CF 502' },
];

describe('PagesTree', () => {
  it('renders folder nodes and leaf files', () => {
    render(<PagesTree pages={pages} selectedPath={null} onSelect={() => {}} />);
    expect(screen.getByText('docs')).toBeInTheDocument();
    expect(screen.getByText('cdn.md')).toBeInTheDocument();
    expect(screen.getByText('cli')).toBeInTheDocument();
  });

  it('calls onSelect with the page path when a leaf is clicked', () => {
    const onSelect = vi.fn();
    render(<PagesTree pages={pages} selectedPath={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByText('cdn.md'));
    expect(onSelect).toHaveBeenCalledWith('docs/cdn');
  });

  it('marks failed nodes as still clickable', () => {
    const onSelect = vi.fn();
    render(<PagesTree pages={pages} selectedPath={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByText('edge.md'));
    expect(onSelect).toHaveBeenCalledWith('docs/edge');
  });

  it('renders folder count badges like (3/4)', () => {
    render(<PagesTree pages={pages} selectedPath={null} onSelect={() => {}} />);
    // docs/ contains 3 ok-ish entries; one failed.
    expect(screen.getByText(/2\/3/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `pnpm test src/components/generations/pages-tree.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement `PagesTree`**

Create `src/components/generations/pages-tree.tsx`:

```tsx
'use client';

import { useMemo, useState } from 'react';

export type ManifestPage = {
  url: string;
  path: string | null;
  filename: string | null;
  status: 'ok' | 'failed' | 'skipped';
  blobPath: string | null;
  reason?: string;
};

type FolderNode = {
  kind: 'folder';
  name: string;
  children: TreeNode[];
  okCount: number;
  total: number;
};
type LeafNode = {
  kind: 'leaf';
  name: string;
  page: ManifestPage;
};
type TreeNode = FolderNode | LeafNode;

function buildTree(pages: ManifestPage[]): TreeNode[] {
  const root: FolderNode = { kind: 'folder', name: '', children: [], okCount: 0, total: 0 };
  const folderIndex = new Map<string, FolderNode>([['', root]]);

  for (const page of pages) {
    if (!page.path) continue;
    const segs = page.path.split('/');
    const leafName = `${page.filename ?? segs[segs.length - 1]}`;
    let parent = root;
    const accum: string[] = [];
    for (let i = 0; i < segs.length - 1; i++) {
      accum.push(segs[i]);
      const key = accum.join('/');
      let folder = folderIndex.get(key);
      if (!folder) {
        folder = { kind: 'folder', name: segs[i], children: [], okCount: 0, total: 0 };
        folderIndex.set(key, folder);
        parent.children.push(folder);
      }
      parent = folder;
    }
    parent.children.push({ kind: 'leaf', name: leafName, page });
  }

  function tally(node: TreeNode): void {
    if (node.kind === 'leaf') return;
    for (const c of node.children) tally(c);
    node.total = node.children.reduce(
      (n, c) => n + (c.kind === 'leaf' ? 1 : c.total),
      0,
    );
    node.okCount = node.children.reduce(
      (n, c) =>
        n + (c.kind === 'leaf' ? (c.page.status === 'ok' ? 1 : 0) : c.okCount),
      0,
    );
  }
  tally(root);

  root.children.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return root.children;
}

function StatusDot({ status }: { status: ManifestPage['status'] }) {
  const color =
    status === 'ok' ? 'bg-timeline-done'
    : status === 'failed' ? 'bg-timeline-edit'
    : 'bg-hairline-strong';
  return <span aria-label={status} className={`inline-block h-2 w-2 rounded-full ${color}`} />;
}

function Branch({
  node,
  depth,
  selectedPath,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}) {
  const [open, setOpen] = useState(depth < 2);
  if (node.kind === 'leaf') {
    const selected = node.page.path === selectedPath;
    return (
      <button
        type="button"
        onClick={() => node.page.path && onSelect(node.page.path)}
        className={`flex w-full items-center gap-2 px-2 py-1 text-left text-sm ${
          selected ? 'bg-canvas-soft text-ink' : 'text-body hover:bg-canvas-soft'
        } ${node.page.status === 'ok' ? '' : 'opacity-70'}`}
        style={{ paddingLeft: 8 + depth * 12 }}
      >
        <StatusDot status={node.page.status} />
        <span>{node.name}</span>
      </button>
    );
  }
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-2 py-1 text-left text-sm text-ink hover:bg-canvas-soft"
        style={{ paddingLeft: 8 + depth * 12 }}
      >
        <span>{open ? '▾' : '▸'}</span>
        <span>{node.name}/</span>
        <span className="ml-auto text-xs text-body">
          ({node.okCount}/{node.total})
        </span>
      </button>
      {open && node.children.map((c, i) => (
        <Branch key={i} node={c} depth={depth + 1} selectedPath={selectedPath} onSelect={onSelect} />
      ))}
    </div>
  );
}

export function PagesTree({
  pages,
  selectedPath,
  onSelect,
}: {
  pages: ManifestPage[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
}) {
  const tree = useMemo(() => buildTree(pages), [pages]);
  return (
    <div className="overflow-auto">
      {tree.map((n, i) => (
        <Branch key={i} node={n} depth={0} selectedPath={selectedPath} onSelect={onSelect} />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/components/generations/pages-tree.test.tsx`
Expected: PASS — 4 cases.

- [ ] **Step 5: Commit**

```bash
git add src/components/generations/pages-tree.tsx src/components/generations/pages-tree.test.tsx
git commit -m "feat(ui): PagesTree URL-hierarchy view with status dots"
```

---

## Task 17: `PagesSection` — state matrix wrapper

**Files:**
- Create: `src/components/generations/pages-section.tsx`
- Test: `src/components/generations/pages-section.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `src/components/generations/pages-section.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PagesSection } from './pages-section';
import type { Generation } from '@/db/schema';

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

function gen(overrides: Partial<Generation> = {}): Generation {
  return {
    id: 1,
    siteId: 1,
    userId: 1,
    status: 'running',
    trigger: 'manual',
    notifyEmail: false,
    notifiedAt: null,
    workflowRunId: null,
    resolvedSitemapUrl: null,
    llmsBlobPath: null,
    llmsFullBlobPath: null,
    errorMessage: null,
    startedAt: null,
    completedAt: null,
    createdAt: '',
    updatedAt: '',
    pagesManifestBlobPath: null,
    pagesCount: 0,
    pagesStatus: 'pending',
    pagesErrorMessage: null,
    ...overrides,
  } as Generation;
}

describe('PagesSection', () => {
  it('shows skeleton state when pagesStatus is running', () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ status: 'running', pages: [] })));
    render(wrap(<PagesSection generation={gen({ pagesStatus: 'running' })} />));
    expect(screen.getByText(/rendering/i)).toBeInTheDocument();
  });

  it('shows skip reason when pagesStatus is skipped', () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ status: 'skipped', reason: 'cap', pages: [] })));
    render(
      wrap(<PagesSection generation={gen({ pagesStatus: 'skipped', pagesErrorMessage: 'cap exceeded' })} />),
    );
    expect(screen.getByText(/cap exceeded/i)).toBeInTheDocument();
  });

  it('shows failure card when pagesStatus is failed', () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ status: 'failed', pages: [] })));
    render(wrap(<PagesSection generation={gen({ pagesStatus: 'failed', pagesErrorMessage: 'no creds' })} />));
    expect(screen.getByText(/no creds/i)).toBeInTheDocument();
  });

  it('renders the download link when succeeded', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: 'succeeded',
          pages: [{ url: '', path: 'a', filename: 'a.md', status: 'ok', blobPath: 'x' }],
        }),
      ),
    );
    render(wrap(<PagesSection generation={gen({ pagesStatus: 'succeeded' })} />));
    const link = await screen.findByRole('link', { name: /download all/i });
    expect(link).toHaveAttribute('href', '/api/generations/1/pages.zip');
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `pnpm test src/components/generations/pages-section.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement `PagesSection`**

Create `src/components/generations/pages-section.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Generation } from '@/db/schema';
import { PagesTree, type ManifestPage } from './pages-tree';
import { PagesPreview } from './pages-preview';

type ManifestResponse =
  | { status: 'pending' | 'running'; pages: [] }
  | {
      status: 'succeeded' | 'cancelled';
      pages: ManifestPage[];
      successCount?: number;
      failedCount?: number;
      totalUrls?: number;
    }
  | { status: 'skipped' | 'failed'; reason?: string; pages: [] };

export function PagesSection({ generation }: { generation: Generation }) {
  const [selected, setSelected] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ['pagesManifest', generation.id, generation.pagesStatus],
    queryFn: async (): Promise<ManifestResponse> => {
      const res = await fetch(`/api/generations/${generation.id}/pages`);
      if (!res.ok) throw new Error(`status ${res.status}`);
      return res.json();
    },
    staleTime: 30_000,
  });

  if (generation.pagesStatus === 'pending' || generation.pagesStatus === 'running') {
    return (
      <section className="flex flex-col gap-4 rounded-lg border border-hairline bg-surface-card p-6">
        <h2 className="caption-uppercase text-ink">Pages</h2>
        <div className="text-body">Rendering page Markdown…</div>
      </section>
    );
  }
  if (generation.pagesStatus === 'skipped') {
    return (
      <section className="flex flex-col gap-2 rounded-lg border border-hairline bg-surface-card p-6">
        <h2 className="caption-uppercase text-ink">Pages</h2>
        <p className="text-body">
          Skipped — {generation.pagesErrorMessage ?? 'no eligible URLs.'}
        </p>
      </section>
    );
  }
  if (generation.pagesStatus === 'failed') {
    return (
      <section className="flex flex-col gap-2 rounded-lg border border-hairline bg-surface-card p-6">
        <h2 className="caption-uppercase text-ink">Pages</h2>
        <p className="text-body">{generation.pagesErrorMessage ?? 'Page rendering failed.'}</p>
      </section>
    );
  }

  const manifest = q.data && 'pages' in q.data ? q.data : null;
  const pages = (manifest?.pages ?? []) as ManifestPage[];
  const ok = pages.filter((p) => p.status === 'ok').length;
  const failed = pages.filter((p) => p.status === 'failed').length;
  const summary =
    generation.pagesStatus === 'cancelled'
      ? `Cancelled — ${ok} pages rendered before stop.`
      : `${ok} of ${pages.length} pages rendered${failed ? ` — ${failed} failed` : ''}`;

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-hairline bg-surface-card p-6">
      <div className="flex items-center justify-between">
        <h2 className="caption-uppercase text-ink">Pages</h2>
        <a
          href={`/api/generations/${generation.id}/pages.zip`}
          className="rounded border border-hairline-strong px-3 py-1 text-sm text-ink hover:bg-canvas-soft"
        >
          Download all (.zip)
        </a>
      </div>
      <p className="text-sm text-body">{summary}</p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[280px_1fr]">
        <div className="border-r border-hairline md:pr-2">
          {q.isPending ? (
            <div className="p-2 text-body">Loading manifest…</div>
          ) : (
            <PagesTree pages={pages} selectedPath={selected} onSelect={setSelected} />
          )}
        </div>
        <div className="min-h-[240px] border-l border-hairline md:pl-2">
          <PagesPreview generationId={generation.id} selectedPath={selected} />
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/components/generations/pages-section.test.tsx`
Expected: PASS — 4 cases.

- [ ] **Step 5: Commit**

```bash
git add src/components/generations/pages-section.tsx src/components/generations/pages-section.test.tsx
git commit -m "feat(ui): PagesSection state matrix + tree + preview wrapper"
```

---

## Task 18: Mount `PagesSection` on `/g/[id]`

**Files:**
- Modify: `src/app/(app)/g/[id]/generation-client.tsx`

- [ ] **Step 1: Update the client**

Replace the JSX return in `src/app/(app)/g/[id]/generation-client.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import type { Generation } from '@/db/schema';
import { GenerationDetailCard } from '@/components/generations/generation-detail-card';
import { PagesSection } from '@/components/generations/pages-section';

export function GenerationClient({ initial }: { initial: Generation }) {
  const router = useRouter();
  const [generation, setGeneration] = useState<Generation>(initial);

  useEffect(() => {
    if (['succeeded', 'failed', 'cancelled'].includes(initial.status)) return;
    const es = new EventSource(`/api/generations/${initial.id}/stream`);
    es.addEventListener('status', (e) => {
      const next = JSON.parse((e as MessageEvent).data);
      setGeneration((prev) => ({ ...prev, ...next }));
    });
    es.onerror = () => es.close();
    return () => es.close();
  }, [initial.id, initial.status]);

  const cancel = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/generations/${generation.id}/cancel`, { method: 'POST' });
      if (!res.ok) throw new Error('Cancel failed');
      return res.json() as Promise<{ generation: Generation }>;
    },
    onSuccess: ({ generation: g }) => setGeneration(g),
  });

  const retry = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/generations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ siteId: generation.siteId }),
      });
      if (!res.ok) throw new Error('Retry failed');
      return res.json() as Promise<{ generation: { id: number } }>;
    },
    onSuccess: ({ generation: g }) => router.push(`/g/${g.id}`),
  });

  return (
    <div className="flex flex-col gap-6">
      <GenerationDetailCard
        generation={generation}
        onRetry={() => retry.mutate()}
        onCancel={() => cancel.mutate()}
      />
      <PagesSection generation={generation} />
    </div>
  );
}
```

- [ ] **Step 2: Run dev server and smoke test in a browser**

Run: `pnpm dev`
Manually: open `/g/<id>` for a finished generation in your dev DB. Confirm the new "Pages" section renders below the existing card, with the correct state for each `pagesStatus`.

(If you don't yet have a generation with pages output in dev, this verification can be deferred to Task 21's E2E test.)

- [ ] **Step 3: Commit**

```bash
git add src/app/(app)/g/[id]/generation-client.tsx
git commit -m "feat(ui): mount PagesSection on /g/[id]"
```

---

## Task 19: Email — mention pages on success

**Files:**
- Modify: `src/lib/workflow/steps.ts`
- Modify: `src/lib/workflow/steps.test.ts`

- [ ] **Step 1: Write a failing test**

Append to `src/lib/workflow/steps.test.ts`:

```ts
  it('notifyStep mentions pages when pagesStatus=succeeded', async () => {
    const send = vi.fn(async () => ({ data: { id: 'x' }, error: null }));
    const { Resend } = await import('resend');
    vi.mocked(Resend).mockImplementation(() => ({ emails: { send } }) as any);

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
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `pnpm test src/lib/workflow/steps.test.ts -t "notifyStep mentions pages"`
Expected: FAIL.

- [ ] **Step 3: Update `notifyStep` HTML body**

In `src/lib/workflow/steps.ts`, in `notifyStep`, replace the `html:` field on the resend call:

```ts
      const pagesLine =
        g.pagesStatus === 'succeeded' && g.pagesCount > 0
          ? `<p>We also rendered Markdown for ${g.pagesCount} pages — view them on the generation page.</p>`
          : '';
      await resend.emails.send({
        from: fromEmail,
        to: u.email,
        subject: 'Your llms.txt is ready',
        html: `<p>Your generation completed.</p>${pagesLine}<p><a href="${link}">View and download</a></p>`,
      });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/lib/workflow/steps.test.ts`
Expected: PASS — all cases including the new one.

- [ ] **Step 5: Commit**

```bash
git add src/lib/workflow/steps.ts src/lib/workflow/steps.test.ts
git commit -m "feat(email): mention rendered page count in completion email"
```

---

## Task 20: `.env.example` — Cloudflare keys

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Add the new env vars**

Append to `.env.example`:

```
# Cloudflare Browser Rendering (per-page markdown)
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_API_TOKEN=
# Optional tuning
CLOUDFLARE_BR_CONCURRENCY=5
PAGES_PER_RUN_CAP=250
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "chore(env): add Cloudflare Browser Rendering vars"
```

---

## Task 21: Extend the E2E happy-path test

**Files:**
- Modify: `src/test/e2e/generation-happy-path.test.ts`

- [ ] **Step 1: Extend the existing test and add a failure variant**

Replace the file contents:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Readable } from 'node:stream';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { users, generations } from '@/db/schema';
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
vi.mock('@vercel/blob', () => ({
  put: vi.fn(async (path: string, body: unknown) => {
    blobPuts.push({ path, body });
    return { url: `https://blob.test/${path}`, pathname: path };
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

describe('generation happy path', () => {
  beforeEach(() => {
    sentEmails.length = 0;
    blobPuts.length = 0;
    fetchPageMd.mockReset();
    loadSitemap.mockReset();
    process.env.RESEND_API_KEY = 'test';
    process.env.PUBLIC_BASE_URL = 'http://t';
    process.env.CLOUDFLARE_ACCOUNT_ID = 'acc';
    process.env.CLOUDFLARE_API_TOKEN = 'tok';
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
    expect(g.status).toBe('succeeded');
    expect(g.llmsBlobPath).toBe(`gens/${generationId}/llms.txt`);
    expect(g.llmsFullBlobPath).toBe(`gens/${generationId}/llms-full.txt`);
    expect(g.pagesStatus).toBe('succeeded');
    expect(g.pagesCount).toBe(3);
    expect(g.pagesManifestBlobPath).toBe(`gens/${generationId}/pages-manifest.json`);

    const pageWrites = blobPuts.filter((b) => b.path.includes(`gens/${generationId}/pages/`));
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
```

- [ ] **Step 2: Run the test**

Run: `pnpm test src/test/e2e/generation-happy-path.test.ts`
Expected: PASS — both cases.

- [ ] **Step 3: Final verification — full test suite + lint + build**

Run: `pnpm test && pnpm lint && pnpm build`
Expected: green across the board.

- [ ] **Step 4: Commit**

```bash
git add src/test/e2e/generation-happy-path.test.ts
git commit -m "test(e2e): extend happy path with per-page markdown branch"
```

---

## Done

The feature is now end-to-end: schema → utilities → workflow branch → API → UI → email → cron → tests. Every layer has its own commit so the history reads as a clean stack of additions.
