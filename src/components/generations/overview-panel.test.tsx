import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OverviewPanel } from './overview-panel';

function renderWithLatest(audits: unknown[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ audits }), { status: 200 })));
  const onNavigate = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <OverviewPanel siteId="s1" onNavigate={onNavigate} />
    </QueryClientProvider>,
  );
  return { onNavigate };
}

const mkAudit = (pageUrl: string, checks: unknown[]) => ({ pageUrl, status: 'succeeded', score: 50, tier: 'fair', results: { checks } });

describe('OverviewPanel', () => {
  it('shows the three pillar cards with Recommendable as coming soon', async () => {
    renderWithLatest([mkAudit('https://x.com/', [{ id: 'answer-position', passed: true, score: 100, weight: 15, evidence: [], recommendation: null }])]);
    // Use role query for pillar card buttons to avoid matching the status sentence which also contains "Readable"
    expect(await screen.findByRole('button', { name: /readable/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /recognized/i })).toBeInTheDocument();
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
  });

  it('surfaces the highest-weight failing check as Do this next and navigates on click', async () => {
    const { onNavigate } = renderWithLatest([
      mkAudit('https://x.com/', [{ id: 'schema-type', passed: false, score: 0, weight: 10, evidence: [], recommendation: 'Add schema' }]),
    ]);
    expect(await screen.findByText(/do this next/i)).toBeInTheDocument();
    expect(screen.getByText('Add schema')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /show me how/i }));
    expect(onNavigate).toHaveBeenCalledWith('recognized');
  });
});
