import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GeoSignalList } from './geo-signal-list';
import type { SerializedSiteGeoAudit } from '@/lib/geo-audit/serialize';

vi.mock('@/components/tasks/add-task-button', () => ({
  AddTaskButton: ({ finding }: { finding: { sourceId: string } }) => (
    <div data-testid={`add-task-${finding.sourceId}`} />
  ),
}));

const signals: NonNullable<SerializedSiteGeoAudit['results']>['signals'] = [
  { signal: 'pricing', label: 'Public pricing page', tags: ['value'], weight: 40, present: true, artifacts: ['from $29/mo'], pages: ['https://acme.test/pricing'], recommendation: null },
  { signal: 'comparison', label: 'Competitor comparison', tags: ['comparison'], weight: 30, present: false, artifacts: [], pages: [], recommendation: 'Add a comparison page.' },
];

describe('GeoSignalList', () => {
  it('renders present signals with artifacts and missing ones with recommendations', () => {
    render(<GeoSignalList signals={signals} siteUid="s1" />);
    expect(screen.getByText('Public pricing page')).toBeInTheDocument();
    expect(screen.getByText('from $29/mo')).toBeInTheDocument();
    expect(screen.getByText('Add a comparison page.')).toBeInTheDocument();
    expect(screen.getAllByRole('progressbar').length).toBe(2);
  });

  it('renders an add-task button only for absent signals', () => {
    render(<GeoSignalList signals={signals} siteUid="s1" />);
    expect(screen.getByTestId('add-task-comparison')).toBeInTheDocument();
    expect(screen.queryByTestId('add-task-pricing')).toBeNull();
  });
});
