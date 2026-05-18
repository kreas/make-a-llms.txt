import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import archiver from 'archiver';
import { and, desc, eq } from 'drizzle-orm';
import { get } from '@vercel/blob';
import { ApiError, assertOwnsGeneration } from '@/lib/auth-guards';
import { getDb } from '@/db';
import { generations, sites, type Generation } from '@/db/schema';
import { cancelRun } from '@/lib/workflow/wdk';

export type GenerationStatus = Generation['status'];
export type PagesStatus = Generation['pagesStatus'];
export type SummariesStatus = Generation['summariesStatus'];

export type GenerationView = {
  id: number;
  status: GenerationStatus;
  pages: { status: PagesStatus; count: number; errorMessage?: string };
  summaries: {
    status: SummariesStatus;
    count: number;
    emptyCount: number;
    failedCount: number;
    errorMessage?: string;
  };
  files: {
    llms: { ready: boolean };
    llmsFull: { ready: boolean };
    pages: { ready: boolean };
  };
  errorMessage?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
};

export async function getGenerationView(
  generationId: number,
  userId: number,
): Promise<GenerationView> {
  const g = await assertOwnsGeneration(generationId, userId);
  return {
    id: g.id,
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
  generationId: number,
  userId: number,
  kind: GenerationFileKind,
): Promise<{ stream: ReadableStream; filename: string }> {
  const g = await assertOwnsGeneration(generationId, userId);
  const { field, filename } = FILE_FIELDS[kind];
  const path = g[field];
  if (!path) throw new ApiError(404, 'not_ready', 'File not ready');
  const blob = await get(path, { access: 'private' });
  if (!blob) throw new ApiError(404, 'not_found', 'File not found');
  if (!blob.stream) throw new ApiError(404, 'not_found', 'File stream unavailable');
  return { stream: blob.stream, filename };
}

type ManifestEntry = { path: string; blobPath: string | null; status: 'ok' | 'error' | 'skipped'; bytes?: number };

export async function readPageManifest(
  generationId: number,
  userId: number,
): Promise<{
  status: PagesStatus;
  count: number;
  pages: Array<{ path: string; status: 'ok' | 'error' | 'skipped'; bytes?: number }>;
}> {
  const g = await assertOwnsGeneration(generationId, userId);
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
      path: p.path,
      status: p.status,
      bytes: p.bytes,
    })),
  };
}

export async function readPageMarkdown(
  generationId: number,
  userId: number,
  path: string,
): Promise<ReadableStream> {
  const g = await assertOwnsGeneration(generationId, userId);
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
  const blob = await get(entry.blobPath, { access: 'private' });
  if (!blob) throw new ApiError(404, 'not_found', 'Page blob missing');
  if (!blob.stream) throw new ApiError(404, 'not_found', 'Page stream unavailable');
  return blob.stream;
}

const TERMINAL_STATUSES = new Set<GenerationStatus>(['succeeded', 'failed', 'cancelled']);

export async function cancelGeneration(
  generationId: number,
  userId: number,
): Promise<Generation> {
  const gen = await assertOwnsGeneration(generationId, userId);
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
    .where(eq(generations.id, generationId))
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
  generationId: number,
  userId: number,
): Promise<{ stream: ReadableStream<Uint8Array>; filename: string }> {
  const gen = await assertOwnsGeneration(generationId, userId);
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
  const filename = `${slugify(site?.name ?? 'site')}-pages-${gen.id}.zip`;

  const archive = archiver('zip', { zlib: { level: 6 } });
  archive.append(manifestText, { name: 'manifest.json' });
  for (const entry of manifest.pages) {
    if (entry.status !== 'ok' || !entry.blobPath || !entry.path) continue;
    const pageBlob = await get(entry.blobPath, { access: 'private' });
    if (!pageBlob || !pageBlob.stream) continue;
    const nodeStream = Readable.fromWeb(pageBlob.stream as unknown as NodeReadableStream);
    archive.append(nodeStream, { name: `${entry.path}.md` });
  }
  void archive.finalize();

  const stream = Readable.toWeb(archive) as unknown as ReadableStream<Uint8Array>;
  return { stream, filename };
}

export type GenerationListItem = {
  id: number;
  siteId: number;
  status: GenerationStatus;
  trigger: 'manual' | 'webhook';
  pagesStatus: PagesStatus;
  pagesCount: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
};

export type ListGenerationsOptions = {
  siteId?: number;
  status?: GenerationStatus;
  limit?: number;
};

const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 100;

export async function listGenerations(
  userId: number,
  opts: ListGenerationsOptions = {},
): Promise<GenerationListItem[]> {
  const limit = Math.min(Math.max(opts.limit ?? DEFAULT_LIST_LIMIT, 1), MAX_LIST_LIMIT);
  const filters = [eq(generations.userId, userId)];
  if (opts.siteId !== undefined) filters.push(eq(generations.siteId, opts.siteId));
  if (opts.status !== undefined) filters.push(eq(generations.status, opts.status));

  const rows = await getDb()
    .select()
    .from(generations)
    .where(and(...filters))
    .orderBy(desc(generations.createdAt))
    .limit(limit);

  return rows.map((g) => ({
    id: g.id,
    siteId: g.siteId,
    status: g.status,
    trigger: g.trigger,
    pagesStatus: g.pagesStatus,
    pagesCount: g.pagesCount,
    createdAt: g.createdAt,
    startedAt: g.startedAt ?? undefined,
    completedAt: g.completedAt ?? undefined,
  }));
}
