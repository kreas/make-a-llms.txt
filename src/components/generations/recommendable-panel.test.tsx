import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RecommendablePanel } from './recommendable-panel';

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const fetchMock = vi.fn();
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock); });

const RESULT = {
  status: 'succeeded', score: 70, tier: 'good', fetchedAt: new Date().toISOString(),
  siteType: 'publisher', goal: 'build-trust',
  results: {
    siteType: 'publisher', goal: 'build-trust', score: 70, tier: 'good',
    metadata: { pagesScanned: 18, candidates: 4, confirmCalls: 4 },
    signals: [
      { signal: 'author-credibility', label: 'Author credibility', tags: ['trust'], weight: 25, present: true, artifacts: ['bylines + bios'], pages: ['https://b.test/p'], recommendation: null },
    ],
  },
};

describe('RecommendablePanel', () => {
  it('auto-discovers then shows the confirm card when no audit exists', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ audit: null }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ suggestedType: 'publisher', confidence: 0.86 }) });
    wrap(<RecommendablePanel siteId="s1" />);
    expect(await screen.findByText(/blog \/ publisher/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^analyze/i })).toBeInTheDocument();
    const classifyCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/geo-audit/classify'));
    expect(classifyCalls.length).toBe(1);
  });

  it('renders results when a succeeded audit exists', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ audit: RESULT }) });
    wrap(<RecommendablePanel siteId="s1" />);
    expect(await screen.findByText('70')).toBeInTheDocument();
    expect(screen.getByText('Author credibility')).toBeInTheDocument();
    expect(screen.getByText('bylines + bios')).toBeInTheDocument();
  });

  it('shows a running state for an in-flight audit', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ audit: { status: 'running', stage: 'confirming' } }) });
    wrap(<RecommendablePanel siteId="s1" />);
    expect(await screen.findByText(/analyzing/i)).toBeInTheDocument();
  });
});
