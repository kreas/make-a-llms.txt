import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PagesPreview } from './pages-preview';

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

describe('PagesPreview', () => {
  it('renders the empty state when no path is selected', () => {
    render(wrap(<PagesPreview generationId="11111111-1111-4111-8111-111111111111" selectedPath={null} />));
    expect(screen.getByText(/select a page/i)).toBeInTheDocument();
  });

  it('fetches markdown and shows it as raw text', async () => {
    fetchMock.mockResolvedValueOnce(new Response('# Hello\n\nWorld'));
    render(wrap(<PagesPreview generationId="11111111-1111-4111-8111-111111111111" selectedPath="docs/cdn" />));
    await waitFor(() => {
      expect(screen.getByText(/# Hello/)).toBeInTheDocument();
    });
    expect(screen.queryByRole('heading', { name: /hello/i })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/generations/11111111-1111-4111-8111-111111111111/pages/docs/cdn');
  });

  it('shows an error state on fetch failure', async () => {
    fetchMock.mockResolvedValueOnce(new Response('nope', { status: 500 }));
    render(wrap(<PagesPreview generationId="11111111-1111-4111-8111-111111111111" selectedPath="docs/cdn" />));
    await waitFor(() => expect(screen.getByText(/couldn['']t load/i)).toBeInTheDocument());
  });
});
