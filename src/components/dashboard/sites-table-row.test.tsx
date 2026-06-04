import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SitesTableRow } from './sites-table-row';
import type { DashboardSiteRow } from '@/lib/services/dashboard';
import type { Site } from '@/db/schema';

function row(over: Partial<DashboardSiteRow>): DashboardSiteRow {
  const site = { id: 1, uid: 'uid-1', name: 'acme.com', rootUrl: 'https://acme.com', displayName: null, faviconUrl: null } as Site;
  return {
    site,
    scores: { readable: { score: 80, tier: 'good' }, recommendable: null, recognized: { score: 60, tier: 'fair' } },
    composite: 70,
    issues: 3,
    nextAction: { checkId: 'h1-present', pillar: 'readable', pageUrl: 'https://acme.com/', weight: 5, recommendation: 'Add an H1' },
    lastAuditedAt: '2026-06-01T00:00:00Z',
    audited: true,
    ...over,
  };
}
function wrap(r: DashboardSiteRow) {
  return render(<table><tbody><SitesTableRow row={r} /></tbody></table>);
}

describe('SitesTableRow', () => {
  it('shows composite, pillar values and a dash for unscored pillars', () => {
    wrap(row({}));
    expect(screen.getByText('70')).toBeInTheDocument(); // composite ring
    expect(screen.getByText('80')).toBeInTheDocument(); // readable
    expect(screen.getByText('—')).toBeInTheDocument();  // recommendable not run
    expect(screen.getByText(/3 issues/)).toBeInTheDocument();
  });

  it('shows a Run audit action for a never-audited site', () => {
    wrap(row({ audited: false, composite: null, issues: 0, nextAction: null,
      scores: { readable: null, recommendable: null, recognized: null }, lastAuditedAt: null }));
    expect(screen.getByRole('link', { name: /run audit/i })).toHaveAttribute('href', '/sites/uid-1');
  });

  it('shows caught up when there are no issues but it was audited', () => {
    wrap(row({ issues: 0, nextAction: null }));
    expect(screen.getByText(/caught up/i)).toBeInTheDocument();
  });

  it('uses the singular "1 issue" for a single issue', () => {
    wrap(row({ issues: 1 }));
    expect(screen.getByText('1 issue')).toBeInTheDocument();
  });

  it('shows issues (not Run audit) for a GEO-only site scored without a citation audit', () => {
    // audited=false (no citation audit) but a composite exists from a GEO audit
    wrap(row({
      audited: false,
      composite: 65,
      issues: 2,
      scores: { readable: null, recommendable: { score: 65, tier: 'fair' }, recognized: null },
    }));
    expect(screen.queryByRole('link', { name: /run audit/i })).toBeNull();
    expect(screen.getByText('2 issues')).toBeInTheDocument();
  });
});
