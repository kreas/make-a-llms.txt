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
