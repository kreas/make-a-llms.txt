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

  it('extracts cover image from body and resolves homepage brand logo', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.endsWith('/pages')) {
        return Promise.resolve(new Response(
          JSON.stringify({
            status: 'succeeded',
            pages: [
              { url: 'https://a.test/a', path: 'a', filename: 'a.md', status: 'ok', blobPath: 'x' },
              { url: 'https://a.test/', path: 'index', filename: 'index.md', status: 'ok', blobPath: 'y' }
            ],
          }),
        ));
      }
      if (url.includes('/pages/a')) {
        return Promise.resolve(new Response(
          '---\ntitle: Blog Page\npage_type: blog\nupdated: 2026-05-28\ndescription: Desc\n---\n\nCheck this out: ![cool image](/images/cool-blog-image.png)',
        ));
      }
      if (url.includes('/pages/index')) {
        return Promise.resolve(new Response(
          '---\ntitle: Homepage\nimage: /images/brand-banner.png\n---\n\nHome content',
        ));
      }
      return Promise.reject(new Error('unknown url'));
    });

    render(wrap(<PagesContentPanel generation={gen({ pagesStatus: 'succeeded' })} siteId="1" />));

    const aPageTrigger = await screen.findByText('a.md');
    await userEvent.click(aPageTrigger);

    const jsonLdTab = await screen.findByText('JSON-LD');
    await userEvent.click(jsonLdTab);

    // Should render the page image extracted from markdown body (resolved with canonical host)
    expect(await screen.findByText(/https:\/\/a.test\/images\/cool-blog-image.png/)).toBeInTheDocument();
    // Publisher logo should resolve to the homepage's cover image
    expect(screen.getByText(/https:\/\/a.test\/images\/brand-banner.png/)).toBeInTheDocument();
  });

  it('falls back to site-specific logo when homepage is missing logo', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.endsWith('/pages')) {
        return Promise.resolve(new Response(
          JSON.stringify({
            status: 'succeeded',
            pages: [
              { url: 'https://www.aiready.cat/a', path: 'a', filename: 'a.md', status: 'ok', blobPath: 'x' }
            ],
          }),
        ));
      }
      if (url.includes('/pages/a')) {
        return Promise.resolve(new Response(
          '---\ntitle: Blog Page\npage_type: blog\nupdated: 2026-05-28\ndescription: Desc\n---\n\nNo images here.',
        ));
      }
      if (url.includes('/pages/index')) {
        return Promise.resolve(new Response(null, { status: 404 }));
      }
      return Promise.reject(new Error('unknown url'));
    });

    render(wrap(<PagesContentPanel generation={gen({ pagesStatus: 'succeeded' })} siteId="1" />));

    const jsonLdTab = await screen.findByText('JSON-LD');
    await userEvent.click(jsonLdTab);

    // Publisher logo should fallback to logo-v4.png on the aiready.cat domain
    expect(await screen.findByText(/https:\/\/www.aiready.cat\/logo-v4.png/)).toBeInTheDocument();
  });
});

