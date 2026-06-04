import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SitesTable } from './sites-table';
import type { DashboardSiteRow } from '@/lib/services/dashboard';
import type { Site } from '@/db/schema';

function r(id: number, displayName: string, host: string): DashboardSiteRow {
  return {
    site: { id, uid: `uid-${id}`, name: host, rootUrl: `https://${host}`, displayName, faviconUrl: null } as Site,
    scores: { readable: null, recommendable: null, recognized: null },
    composite: null, issues: 0, nextAction: null, lastAuditedAt: null, audited: false,
  };
}

describe('SitesTable', () => {
  it('renders a header and one row per site', () => {
    render(<SitesTable rows={[r(1, 'Acme', 'acme.com'), r(2, 'Bravo', 'bravo.io')]} />);
    expect(screen.getByText('Readable')).toBeInTheDocument();
    expect(screen.getByText('Recommendable')).toBeInTheDocument();
    expect(screen.getByText('Recognized')).toBeInTheDocument();
    expect(screen.getByText('Acme')).toBeInTheDocument();
    expect(screen.getByText('Bravo')).toBeInTheDocument();
  });
});
