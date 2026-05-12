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
