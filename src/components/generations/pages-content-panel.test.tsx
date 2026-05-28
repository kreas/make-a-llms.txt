import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
    uid: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
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
    render(wrap(<PagesContentPanel generation={null} siteId="1" />));
    expect(screen.getByText(/no generation selected/i)).toBeInTheDocument();
  });

  it('shows skeleton state when pagesStatus is running', () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ status: 'running', pages: [] })));
    render(wrap(<PagesContentPanel generation={gen({ pagesStatus: 'running' })} siteId="1" />));
    expect(screen.getByText(/rendering/i)).toBeInTheDocument();
  });

  it('shows skip reason when pagesStatus is skipped', () => {
    render(
      wrap(
        <PagesContentPanel
          generation={gen({ pagesStatus: 'skipped', pagesErrorMessage: 'cap exceeded' })}
          siteId="1"
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
          siteId="1"
        />,
      ),
    );
    expect(screen.getByText(/no creds/i)).toBeInTheDocument();
  });

  it('renders the menubar and export trigger when succeeded', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: 'succeeded',
          pages: [{ url: 'https://a.test', path: 'a', filename: 'a.md', status: 'ok', blobPath: 'x' }],
        }),
      ),
    );
    render(wrap(<PagesContentPanel generation={gen({ pagesStatus: 'succeeded' })} siteId="1" />));
    
    const tabTrigger = await screen.findByText('pages.md');
    await userEvent.click(tabTrigger);

    const exportTrigger = await screen.findByText(/Export/);
    expect(exportTrigger).toBeInTheDocument();
  });

  it('renders and allows copying JSON-LD schema', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.endsWith('/pages')) {
        return Promise.resolve(new Response(
          JSON.stringify({
            status: 'succeeded',
            pages: [{ url: 'https://a.test/a', path: 'a', filename: 'a.md', status: 'ok', blobPath: 'x' }],
          }),
        ));
      }
      if (url.includes('/pages/a')) {
        return Promise.resolve(new Response(
          '---\ntitle: Schema Title\npage_type: blog\nupdated: 2026-05-28\ndescription: Some desc\n---\n\nBody',
        ));
      }
      return Promise.reject(new Error('unknown url'));
    });

    render(wrap(<PagesContentPanel generation={gen({ pagesStatus: 'succeeded' })} siteId="1" />));

    const jsonLdTab = await screen.findByText('JSON-LD');
    await userEvent.click(jsonLdTab);

    expect((await screen.findAllByText(/type/)).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/BlogPosting/)).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/headline/)).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/Schema Title/)).length).toBeGreaterThan(0);

    const copyBtn = screen.getByRole('button', { name: /copy schema/i });
    expect(copyBtn).toBeInTheDocument();
    await userEvent.click(copyBtn);

    expect(await screen.findByText('Copy raw JSON')).toBeInTheDocument();
    expect(screen.getByText('Copy with HTML markup')).toBeInTheDocument();
  });
});
