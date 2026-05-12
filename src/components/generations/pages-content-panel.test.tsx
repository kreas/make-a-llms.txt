import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PagesContentPanel } from './pages-content-panel';
import type { Generation } from '@/db/schema';

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

function gen(overrides: Partial<Generation> = {}): Generation {
  return {
    id: 1,
    siteId: 1,
    userId: 1,
    status: 'running',
    trigger: 'manual',
    notifyEmail: false,
    notifiedAt: null,
    workflowRunId: null,
    resolvedSitemapUrl: null,
    llmsBlobPath: null,
    llmsFullBlobPath: null,
    errorMessage: null,
    startedAt: null,
    completedAt: null,
    createdAt: '',
    updatedAt: '',
    pagesManifestBlobPath: null,
    pagesCount: 0,
    pagesStatus: 'pending',
    pagesErrorMessage: null,
    ...overrides,
  } as Generation;
}

describe('PagesContentPanel', () => {
  it('shows placeholder when generation is null', () => {
    render(wrap(<PagesContentPanel generation={null} />));
    expect(screen.getByText(/no generation selected/i)).toBeInTheDocument();
  });

  it('shows skeleton state when pagesStatus is running', () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ status: 'running', pages: [] })));
    render(wrap(<PagesContentPanel generation={gen({ pagesStatus: 'running' })} />));
    expect(screen.getByText(/rendering/i)).toBeInTheDocument();
  });

  it('shows skip reason when pagesStatus is skipped', () => {
    render(
      wrap(
        <PagesContentPanel
          generation={gen({ pagesStatus: 'skipped', pagesErrorMessage: 'cap exceeded' })}
        />,
      ),
    );
    expect(screen.getByText(/cap exceeded/i)).toBeInTheDocument();
  });

  it('shows failure message when pagesStatus is failed', () => {
    render(
      wrap(
        <PagesContentPanel
          generation={gen({ pagesStatus: 'failed', pagesErrorMessage: 'no creds' })}
        />,
      ),
    );
    expect(screen.getByText(/no creds/i)).toBeInTheDocument();
  });

  it('renders the download link when succeeded', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: 'succeeded',
          pages: [{ url: '', path: 'a', filename: 'a.md', status: 'ok', blobPath: 'x' }],
        }),
      ),
    );
    render(wrap(<PagesContentPanel generation={gen({ pagesStatus: 'succeeded' })} />));
    const link = await screen.findByRole('link', { name: /download all/i });
    expect(link).toHaveAttribute('href', '/api/generations/1/pages.zip');
  });
});
