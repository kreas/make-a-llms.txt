import { get } from '@vercel/blob';
import { ApiError, assertOwnsGeneration } from '@/lib/auth-guards';
import type { Generation } from '@/db/schema';

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
