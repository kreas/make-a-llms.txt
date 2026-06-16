import { describe, it, expect } from 'vitest';
import { auditReportToMarkdown } from './report-markdown';
import { buildAuditReport, type AuditLike } from './report';

const audit: AuditLike = {
  pageUrl: 'https://example.com/pricing',
  status: 'succeeded',
  score: 78,
  tier: 'good',
  fetchedAt: '2026-06-16T09:30:00.000Z',
  results: {
    pageTitle: 'Pricing — Example Co',
    checks: [
      { id: 'h1-present', passed: true, score: 100, weight: 5, evidence: ['H1 found'], recommendation: null },
      { id: 'answer-position', passed: false, score: 40, weight: 15, evidence: ['No answer up top'], recommendation: 'Lead with the answer.' },
    ],
  },
};

describe('auditReportToMarkdown', () => {
  const md = auditReportToMarkdown(buildAuditReport(audit)!);

  it('includes a title and the page metadata', () => {
    expect(md).toContain('# AI Readability Report');
    expect(md).toContain('**Page:** Pricing — Example Co');
    expect(md).toContain('**URL:** https://example.com/pricing');
    expect(md).toContain('**Score:** 78/100 (Good)');
    expect(md).toContain('**Checks passing:** 1 of 2');
    expect(md).toContain('**Audited:** June 16, 2026');
  });

  it('renders the category breakdown as a table', () => {
    expect(md).toContain('| Category | Score |');
    expect(md).toContain('| Structure | ');
  });

  it('renders failing checks first with pass/fail markers and a fix', () => {
    const fail = md.indexOf('Answer in first 100 words');
    const pass = md.indexOf('H1 present');
    expect(fail).toBeGreaterThan(-1);
    expect(fail).toBeLessThan(pass);
    expect(md).toContain('### ❌ Answer in first 100 words');
    expect(md).toContain('- **Fix:** Lead with the answer.');
    expect(md).toContain('- **Found:** No answer up top');
  });

  it('ends with a single trailing newline', () => {
    expect(md.endsWith('\n')).toBe(true);
    expect(md.endsWith('\n\n')).toBe(false);
  });
});
