import { describe, it, expect } from 'vitest';
import { serializeSiteGeoAudit } from './serialize';
import type { SiteGeoAudit } from '@/db/schema';

const row: SiteGeoAudit = {
  id: 1, uid: 'geo-1', siteId: 10, generationId: 5,
  status: 'succeeded', score: 70, tier: 'good',
  results: JSON.stringify({ siteType: 'saas', goal: 'get-cited', score: 70, tier: 'good', signals: [], metadata: { pagesScanned: 3, candidates: 2, confirmCalls: 2 } }),
  errorReason: null, errorMessage: null, llmMsUsed: 1200,
  crawlJobId: 'job-1', workflowRunId: 'run-1', stage: null,
  siteType: 'saas', goal: 'get-cited',
  fetchedAt: '2026-06-02T00:00:00Z', trigger: 'manual',
};

describe('serializeSiteGeoAudit', () => {
  it('surfaces status, stage, siteType, goal and parses results', () => {
    const out = serializeSiteGeoAudit(row, 'site-uid');
    expect(out.id).toBe('geo-1');
    expect(out.status).toBe('succeeded');
    expect(out.siteType).toBe('saas');
    expect(out.goal).toBe('get-cited');
    expect(out.results?.siteType).toBe('saas');
  });

  it('exposes stage for an in-flight run', () => {
    const out = serializeSiteGeoAudit({ ...row, status: 'running', stage: 'confirming', results: null, score: null, tier: null }, 'site-uid');
    expect(out.status).toBe('running');
    expect(out.stage).toBe('confirming');
    expect(out.results).toBeNull();
  });
});
