import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
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
  it('shows the three pillar cards', async () => {
    renderWithLatest([mkAudit('https://x.com/', [{ id: 'answer-position', passed: true, score: 100, weight: 15, evidence: [], recommendation: null }])]);
    // Use role query for pillar card buttons to avoid matching the status sentence which also contains "Readable"
    expect(await screen.findByRole('button', { name: /readable/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /recognized/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /recommendable/i })).toBeInTheDocument();
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

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

describe('OverviewPanel GEO card', () => {
  it('renders the live Recommendable score from the GEO audit', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('citation-audits/latest')) {
        return Promise.resolve({ ok: true, json: async () => ({ audits: [] }) });
      }
      if (url.includes('geo-audit/latest')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ audit: { status: 'succeeded', score: 70, tier: 'good', results: { score: 70, tier: 'good', signals: [], metadata: { pagesScanned: 1, candidates: 0, confirmCalls: 0 } } } }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    wrap(<OverviewPanel siteId="site-1" onNavigate={() => {}} />);
    expect(await screen.findByText('70')).toBeInTheDocument();
    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();
  });
});
