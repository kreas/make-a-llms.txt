import { describe, it, expect } from 'vitest';
import { serializeSiteGeoAudit } from './serialize';
import type { SiteGeoAudit } from '@/db/schema';

const row: SiteGeoAudit = {
  id: 1,
  uid: 'geo-uid-1',
  siteId: 10,
  generationId: 5,
  status: 'succeeded',
  score: 70,
  tier: 'good',
  results: JSON.stringify({ score: 70, tier: 'good', signals: [], metadata: { pagesScanned: 3, candidates: 2, confirmCalls: 2 } }),
  errorReason: null,
  errorMessage: null,
  llmMsUsed: 1200,
  fetchedAt: '2026-06-02T00:00:00Z',
  trigger: 'manual',
};

describe('serializeSiteGeoAudit', () => {
  it('uses the site uid and parses results JSON', () => {
    const out = serializeSiteGeoAudit(row, 'site-uid');
    expect(out.id).toBe('geo-uid-1');
    expect(out.siteId).toBe('site-uid');
    expect(out.score).toBe(70);
    expect(out.results?.metadata.pagesScanned).toBe(3);
  });

  it('returns null results when the column is null', () => {
    const out = serializeSiteGeoAudit({ ...row, results: null }, 'site-uid');
    expect(out.results).toBeNull();
  });
});
