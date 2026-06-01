import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import archiver from 'archiver';
import { and, desc, eq } from 'drizzle-orm';
import { get, put } from '@/lib/blob';
import { ApiError, assertOwnsGenerationByUid } from '@/lib/auth-guards';
import { getDb } from '@/db';
import { generations, sites, type Generation } from '@/db/schema';
import { cancelRun } from '@/lib/workflow/wdk';
import { GenerationViewPublic, GenerationPublic } from '@/lib/types/public';
import { fetchPageMarkdown } from '@/lib/markdown-pages/cloudflare';
import { parseHTML } from 'linkedom';
import { buildFrontmatter, extractTitle } from '@/lib/workflow/frontmatter';

export type GenerationStatus = Generation['status'];
export type PagesStatus = Generation['pagesStatus'];
export type SummariesStatus = Generation['summariesStatus'];

export async function getGenerationView(
  generationUid: string,
  userId: number,
): Promise<GenerationViewPublic> {
  const g = await assertOwnsGenerationByUid(generationUid, userId);
  return {
    id: g.uid,
    status: g.status,
    pages: {
      status: g.pagesStatus,
      count: g.pagesCount,
      errorMessage: g.pagesErrorMessage ?? undefined,
    },
    summaries: {
      status: g.summariesStatus,
      count: g.summariesCount,
      emptyCount: g.summariesEmptyCount,
      failedCount: g.summariesFailedCount,
      errorMessage: g.summariesErrorMessage ?? undefined,
    },
    files: {
      llms: { ready: Boolean(g.llmsBlobPath) },
      llmsFull: { ready: Boolean(g.llmsFullBlobPath) },
      pages: { ready: Boolean(g.pagesManifestBlobPath) },
    },
    errorMessage: g.errorMessage ?? undefined,
    startedAt: g.startedAt ?? undefined,
    completedAt: g.completedAt ?? undefined,
    createdAt: g.createdAt,
  };
}

const FILE_FIELDS = {
  llms: { field: 'llmsBlobPath', filename: 'llms.txt' },
  'llms-full': { field: 'llmsFullBlobPath', filename: 'llms-full.txt' },
} as const;
export type GenerationFileKind = keyof typeof FILE_FIELDS;

export async function readGenerationFile(
  generationUid: string,
  userId: number,
  kind: GenerationFileKind,
): Promise<{ stream: ReadableStream; filename: string }> {
  const g = await assertOwnsGenerationByUid(generationUid, userId);
  const { field, filename } = FILE_FIELDS[kind];
  const path = g[field];
  if (!path) throw new ApiError(404, 'not_ready', 'File not ready');
  const blob = await get(path, { access: 'private' });
  if (!blob) throw new ApiError(404, 'not_found', 'File not found');
  if (!blob.stream) throw new ApiError(404, 'not_found', 'File stream unavailable');
  return { stream: blob.stream, filename };
}

type ManifestEntry = { url: string; path: string; blobPath: string | null; status: 'ok' | 'failed' | 'skipped'; bytes?: number };

export async function readPageManifest(
  generationUid: string,
  userId: number,
): Promise<{
  status: PagesStatus;
  count: number;
  pages: Array<{ url: string; path: string; status: 'ok' | 'failed' | 'skipped'; bytes?: number }>;
}> {
  const g = await assertOwnsGenerationByUid(generationUid, userId);
  if (!g.pagesManifestBlobPath) {
    return { status: g.pagesStatus, count: g.pagesCount, pages: [] };
  }
  const blob = await get(g.pagesManifestBlobPath, { access: 'private' });
  if (!blob || !blob.stream) return { status: g.pagesStatus, count: g.pagesCount, pages: [] };
  const text = await new Response(blob.stream).text();
  const parsed = JSON.parse(text) as { pages?: ManifestEntry[] };
  return {
    status: g.pagesStatus,
    count: g.pagesCount,
    pages: (parsed.pages ?? []).map((p) => ({
      url: p.url,
      path: p.path,
      status: p.status,
      bytes: p.bytes,
    })),
  };
}

async function generatePageMarkdownOnTheFly(
  url: string,
  blobPath: string,
): Promise<string> {
  let ogTitle: string | null = null;
  let ogDescription: string | null = null;
  let ogImage: string | null = null;
  let htmlTitle: string | null = null;
  let metaDescription: string | null = null;
  let htmlCanonical: string | null = null;

  try {
    const USER_AGENT = 'MakeALlmsTxt/1.0 (+https://make-a-llms.txt/bot; site-metadata)';
    const htmlRes = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
      },
    });
    if (htmlRes.ok) {
      const html = await htmlRes.text();
      const { document } = parseHTML(html);
      ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content')?.trim() ?? null;
      ogDescription = document.querySelector('meta[property="og:description"]')?.getAttribute('content')?.trim() ?? null;
      ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content')?.trim() ?? null;
      htmlTitle = document.querySelector('title')?.textContent?.trim() ?? null;
      metaDescription = document.querySelector('meta[name="description"]')?.getAttribute('content')?.trim() ?? null;
      htmlCanonical = document.querySelector('link[rel="canonical"]')?.getAttribute('href')?.trim() ?? null;
    }
  } catch (err) {
    console.warn(`Failed to fetch HTML for ${url} during metadata extraction`, err);
  }

  const resolveUrl = (href: string | null, base: string) => {
    if (!href) return null;
    try {
      return new URL(href, base).toString();
    } catch {
      return href;
    }
  };

  const finalOgImage = resolveUrl(ogImage, url);
  const finalCanonical = resolveUrl(htmlCanonical, url) || url;

  const { markdown } = await fetchPageMarkdown(url);
  const title = ogTitle || htmlTitle || extractTitle(markdown) || null;
  const description = ogDescription || metaDescription || null;

  const body =
    buildFrontmatter({
      url,
      updated: new Date().toISOString().slice(0, 10),
      title,
      description,
      image: finalOgImage,
      ogImage: finalOgImage,
      canonical: finalCanonical,
    }) + markdown;

  await put(blobPath, body, {
    access: 'private',
    contentType: 'text/markdown; charset=utf-8',
    addRandomSuffix: false,
    allowOverwrite: true,
  });

  return body;
}

export async function readPageMarkdown(
  generationUid: string,
  userId: number,
  path: string,
): Promise<ReadableStream> {
  const g = await assertOwnsGenerationByUid(generationUid, userId);
  if (!g.pagesManifestBlobPath) {
    throw new ApiError(404, 'not_found', 'No pages for this generation');
  }
  const manifestBlob = await get(g.pagesManifestBlobPath, { access: 'private' });
  if (!manifestBlob || !manifestBlob.stream) throw new ApiError(404, 'not_found', 'Manifest missing');
  const manifest = JSON.parse(await new Response(manifestBlob.stream).text()) as {
    pages: ManifestEntry[];
  };
  const wanted = path.replace(/\.md$/, '');
  const entry = manifest.pages.find((p) => p.path === wanted && p.status === 'ok');
  if (!entry?.blobPath) throw new ApiError(404, 'not_found', 'Page not found');
  let blob = await get(entry.blobPath, { access: 'private' });
  if (!blob || !blob.stream) {
    const body = await generatePageMarkdownOnTheFly(entry.url, entry.blobPath);
    return new Response(body).body as unknown as ReadableStream;
  }
  return blob.stream;
}

const TERMINAL_STATUSES = new Set<GenerationStatus>(['succeeded', 'failed', 'cancelled']);

export async function cancelGeneration(
  generationUid: string,
  userId: number,
): Promise<Generation> {
  const gen = await assertOwnsGenerationByUid(generationUid, userId);
  if (TERMINAL_STATUSES.has(gen.status)) return gen;

  if (gen.workflowRunId) {
    try {
      await cancelRun(gen.workflowRunId);
    } catch (err) {
      console.warn('[cancelGeneration] WDK cancelRun failed', err);
    }
  }

  const ts = new Date().toISOString();
  const [updated] = await getDb()
    .update(generations)
    .set({ status: 'cancelled', completedAt: ts, updatedAt: ts })
    .where(eq(generations.id, gen.id))
    .returning();
  return updated;
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'site'
  );
}

export async function streamPagesZip(
  generationUid: string,
  userId: number,
): Promise<{ stream: ReadableStream<Uint8Array>; filename: string }> {
  const gen = await assertOwnsGenerationByUid(generationUid, userId);
  if (!gen.pagesManifestBlobPath) {
    throw new ApiError(404, 'not_found', 'No pages available');
  }
  const manifestBlob = await get(gen.pagesManifestBlobPath, { access: 'private' });
  if (!manifestBlob || !manifestBlob.stream) {
    throw new ApiError(404, 'not_found', 'Manifest missing');
  }
  const manifestText = await new Response(manifestBlob.stream).text();
  let manifest: { pages: ManifestEntry[] };
  try {
    manifest = JSON.parse(manifestText);
  } catch {
    throw new ApiError(404, 'not_found', 'Manifest unreadable');
  }

  const [site] = await getDb().select().from(sites).where(eq(sites.id, gen.siteId));
  const filename = `${slugify(site?.name ?? 'site')}-pages-${gen.uid}.zip`;

  const archive = archiver('zip', { zlib: { level: 6 } });
  archive.append(manifestText, { name: 'manifest.json' });
  for (const entry of manifest.pages) {
    if (entry.status !== 'ok' || !entry.blobPath || !entry.path) continue;
    try {
      const pageBlob = await get(entry.blobPath, { access: 'private' });
      let nodeStream: any;
      if (!pageBlob || !pageBlob.stream) {
        const body = await generatePageMarkdownOnTheFly(entry.url, entry.blobPath);
        nodeStream = Readable.from(body);
      } else {
        nodeStream = Readable.fromWeb(pageBlob.stream as unknown as NodeReadableStream);
      }
      archive.append(nodeStream, { name: `${entry.path}.md` });
    } catch (err) {
      console.error(`[streamPagesZip] Failed to archive page ${entry.path}:`, err);
    }
  }
  void archive.finalize();

  const stream = Readable.toWeb(archive) as unknown as ReadableStream<Uint8Array>;
  return { stream, filename };
}

export type ListGenerationsOptions = {
  siteUid?: string;
  status?: GenerationStatus;
  limit?: number;
};

const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 100;

export async function listGenerations(
  userId: number,
  opts: ListGenerationsOptions = {},
): Promise<GenerationPublic[]> {
  const limit = Math.min(Math.max(opts.limit ?? DEFAULT_LIST_LIMIT, 1), MAX_LIST_LIMIT);
  const filters = [eq(generations.userId, userId)];
  if (opts.siteUid !== undefined) {
    const [s] = await getDb().select({ id: sites.id }).from(sites).where(
      and(eq(sites.uid, opts.siteUid), eq(sites.userId, userId)),
    );
    if (!s) return [];
    filters.push(eq(generations.siteId, s.id));
  }
  if (opts.status !== undefined) filters.push(eq(generations.status, opts.status));

  const rows = await getDb()
    .select({
      gen: generations,
      siteUid: sites.uid,
    })
    .from(generations)
    .innerJoin(sites, eq(generations.siteId, sites.id))
    .where(and(...filters))
    .orderBy(desc(generations.createdAt))
    .limit(limit);

  return rows.map(({ gen, siteUid }) => ({
    id: gen.uid,
    siteId: siteUid,
    status: gen.status,
    trigger: gen.trigger,
    pagesStatus: gen.pagesStatus,
    pagesCount: gen.pagesCount,
    createdAt: gen.createdAt,
    startedAt: gen.startedAt ?? undefined,
    completedAt: gen.completedAt ?? undefined,
  }));
}
