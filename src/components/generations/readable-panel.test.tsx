import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReadablePanel } from './readable-panel';
import { PageWorkspaceProvider } from './page-workspace-context';
import type { Generation } from '@/db/schema';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('../citations/citations-page-detail', () => ({
  CitationsPageDetail: ({ pageUrl }: { pageUrl: string }) => <div>audit:{pageUrl}</div>,
}));

const gen = { id: 1, uid: 'gen-1', pagesStatus: 'succeeded' } as unknown as Generation;

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.includes('/pages?') || url.endsWith('/pages')) {
      return new Response(JSON.stringify({ status: 'succeeded', pages: [{ path: 'index', url: 'https://x.com/', status: 'ok' }] }), { status: 200 });
    }
    return new Response('---\ntitle: Home\n---\nbody', { status: 200 });
  }));
  return render(
    <QueryClientProvider client={client}>
      <PageWorkspaceProvider generation={gen}>
        <ReadablePanel siteId="site-1" />
      </PageWorkspaceProvider>
    </QueryClientProvider>,
  );
}

describe('ReadablePanel', () => {
  it('shows the Citation Audit sub-tab for the auto-selected index page', async () => {
    setup();
    expect(await screen.findByText('audit:https://x.com/')).toBeInTheDocument();
  });

  it('exposes a pages.md sub-tab trigger', async () => {
    setup();
    expect(await screen.findByText('pages.md')).toBeInTheDocument();
  });
});
