import type { AuditReport } from './report';
import { formatReportDate } from './report';

/** Serialize a page's audit report to client-presentable Markdown. */
export function auditReportToMarkdown(report: AuditReport): string {
  const lines: string[] = [];

  lines.push('# AI Readability Report');
  lines.push('');
  lines.push(`**Page:** ${report.title}`);
  lines.push(`**URL:** ${report.pageUrl}`);
  lines.push(`**Score:** ${report.score}/100 (${report.tierLabel})`);
  lines.push(`**Checks passing:** ${report.passingCount} of ${report.totalCount}`);
  lines.push(`**Audited:** ${formatReportDate(report.fetchedAt)}`);
  lines.push('');

  lines.push('## Category breakdown');
  lines.push('');
  lines.push('| Category | Score |');
  lines.push('| --- | --- |');
  for (const c of report.categories) {
    lines.push(`| ${c.label} | ${c.score}/100 |`);
  }
  lines.push('');

  lines.push('## Checks');
  lines.push('');
  for (const c of report.checks) {
    lines.push(`### ${c.passed ? '✅' : '❌'} ${c.label}`);
    lines.push('');
    lines.push(`- **Result:** ${c.passed ? 'Pass' : 'Fail'} · score ${c.score}/100 · weight ${c.weight}`);
    if (c.evidence.length > 0) {
      lines.push(`- **Found:** ${c.evidence.join(' ')}`);
    }
    if (c.recommendation) {
      lines.push(`- **Fix:** ${c.recommendation}`);
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd() + '\n';
}
