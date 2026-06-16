import { describe, it, expect } from 'vitest';
import { buildAuditReportPdf, auditReportPdfFilename } from './report-pdf';
import { buildAuditReport, type AuditLike } from './report';

const audit: AuditLike = {
  pageUrl: 'https://example.com/pricing',
  status: 'succeeded',
  score: 78,
  tier: 'good',
  fetchedAt: '2026-06-16T09:30:00.000Z',
  results: {
    pageTitle: 'Pricing — Example Co',
    checks: Array.from({ length: 17 }, (_, i) => ({
      id: `check-${i}`,
      passed: i % 2 === 0,
      score: i % 2 === 0 ? 100 : 30,
      weight: 5,
      evidence: ['Some evidence text that is reasonably long to exercise wrapping'],
      recommendation: i % 2 === 0 ? null : 'A recommendation long enough to wrap across multiple lines in the document layout.',
    })),
  },
};

const report = buildAuditReport(audit)!;

describe('buildAuditReportPdf', () => {
  it('produces a valid pdf document with at least one page', () => {
    const doc = buildAuditReportPdf(report);
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
    expect(doc.output('datauristring').startsWith('data:application/pdf')).toBe(true);
  });

  it('paginates a long report onto multiple pages', () => {
    // 17 checks with wrapped evidence + recommendations overflow a single A4 page.
    expect(buildAuditReportPdf(report).getNumberOfPages()).toBeGreaterThan(1);
  });
});

describe('auditReportPdfFilename', () => {
  it('derives a slugged filename from the page url', () => {
    expect(auditReportPdfFilename(report)).toBe('ai-readability-example-com-pricing.pdf');
  });
});
