import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RecommendablePanel } from './recommendable-panel';

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

describe('RecommendablePanel', () => {
  it('shows the empty state with a run button when no audit exists', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ audit: null }) });
    wrap(<RecommendablePanel siteId="site-1" />);
    expect(await screen.findByRole('button', { name: /run geo analysis/i })).toBeInTheDocument();
  });

  it('renders confirmed signals with artifacts from the latest audit', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        audit: {
          id: 'geo-1', status: 'succeeded', score: 70, tier: 'good', fetchedAt: new Date().toISOString(),
          results: {
            score: 70, tier: 'good', metadata: { pagesScanned: 3, candidates: 2, confirmCalls: 2 },
            signals: [
              { signal: 'pricing', weight: 40, present: true, artifacts: ['from $29/mo'], pages: ['https://acme.test/pricing'], recommendation: null },
              { signal: 'comparison', weight: 30, present: false, artifacts: [], pages: [], recommendation: 'Add a comparison page.' },
              { signal: 'case-study', weight: 30, present: true, artifacts: ['40% faster onboarding'], pages: ['https://acme.test/x'], recommendation: null },
            ],
          },
        },
      }),
    });
    wrap(<RecommendablePanel siteId="site-1" />);
    expect(await screen.findByText('from $29/mo')).toBeInTheDocument();
    expect(screen.getByText('40% faster onboarding')).toBeInTheDocument();
    expect(screen.getByText('Add a comparison page.')).toBeInTheDocument();
    expect(screen.getByText('70')).toBeInTheDocument();
  });

  it('runs an audit when the run button is clicked', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ audit: null }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ audit: { id: 'geo-2', status: 'succeeded', score: 0, tier: 'poor', fetchedAt: new Date().toISOString(), results: { score: 0, tier: 'poor', metadata: { pagesScanned: 0, candidates: 0, confirmCalls: 0 }, signals: [] } } }) });
    wrap(<RecommendablePanel siteId="site-1" />);
    const btn = await screen.findByRole('button', { name: /run geo analysis/i });
    await userEvent.click(btn);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/sites/site-1/geo-audit', { method: 'POST' });
    });
  });
});
