import { describe, it, expect } from 'vitest';
import { buildAuditReport, formatReportDate, reportFilenameSlug, type AuditLike } from './report';

const audit: AuditLike = {
  pageUrl: 'https://example.com/pricing',
  status: 'succeeded',
  score: 78,
  tier: 'good',
  fetchedAt: '2026-06-16T09:30:00.000Z',
  results: {
    pageTitle: '  Pricing — Example Co  ',
    checks: [
      { id: 'h1-present', passed: true, score: 100, weight: 5, evidence: ['H1 found'], recommendation: null },
      { id: 'answer-position', passed: false, score: 40, weight: 15, evidence: ['No answer up top'], recommendation: 'Lead with the answer.' },
      { id: 'schema-type', passed: true, score: 100, weight: 10, evidence: [], recommendation: null },
    ],
  },
};

describe('buildAuditReport', () => {
  it('returns null for a failed audit', () => {
    expect(buildAuditReport({ ...audit, status: 'failed', results: null })).toBeNull();
  });

  it('returns null when the score is missing', () => {
    expect(buildAuditReport({ ...audit, score: null })).toBeNull();
  });

  it('trims the page title and falls back to the url', () => {
    expect(buildAuditReport(audit)!.title).toBe('Pricing — Example Co');
    const noTitle = buildAuditReport({ ...audit, results: { ...audit.results!, pageTitle: null } })!;
    expect(noTitle.title).toBe('https://example.com/pricing');
  });

  it('sorts checks failing-first and labels them', () => {
    const report = buildAuditReport(audit)!;
    expect(report.checks[0].id).toBe('answer-position');
    expect(report.checks[0].label).toBe('Answer in first 100 words');
    expect(report.checks[0].passed).toBe(false);
  });

  it('counts passing/failing and the tier label', () => {
    const report = buildAuditReport(audit)!;
    expect(report.totalCount).toBe(3);
    expect(report.passingCount).toBe(2);
    expect(report.failingCount).toBe(1);
    expect(report.tierLabel).toBe('Good');
  });

  it('produces the four categories with weighted scores', () => {
    const report = buildAuditReport(audit)!;
    expect(report.categories.map((c) => c.label)).toEqual([
      'Structure',
      'Answer quality',
      'Metadata & schema',
      'Authority & freshness',
    ]);
    // Answer quality only has answer-position present → 40
    expect(report.categories.find((c) => c.key === 'answer-quality')!.score).toBe(40);
  });
});

describe('formatReportDate', () => {
  it('formats an ISO date in UTC', () => {
    expect(formatReportDate('2026-06-16T09:30:00.000Z')).toBe('June 16, 2026');
  });
  it('passes through an unparseable value', () => {
    expect(formatReportDate('not-a-date')).toBe('not-a-date');
  });
});

describe('reportFilenameSlug', () => {
  it('slugifies a url', () => {
    expect(reportFilenameSlug('https://example.com/docs/getting-started')).toBe('example-com-docs-getting-started');
  });
  it('falls back to "page" for an empty result', () => {
    expect(reportFilenameSlug('https://')).toBe('page');
  });
});
