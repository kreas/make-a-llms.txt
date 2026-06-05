import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RecognizedPanel } from './recognized-panel';
import { PageWorkspaceProvider } from './page-workspace-context';
import type { Generation } from '@/db/schema';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('../citations/page-questions', () => ({
  PageQuestions: ({ pageUrl }: { pageUrl: string }) => <div>questions:{pageUrl}</div>,
}));

const gen = { id: 1, uid: 'gen-1', pagesStatus: 'succeeded' } as unknown as Generation;

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.endsWith('/pages') || url.includes('/pages?')) {
      return new Response(JSON.stringify({ status: 'succeeded', pages: [{ path: 'index', url: 'https://x.com/', status: 'ok' }] }), { status: 200 });
    }
    return new Response('---\ntitle: Home\nurl: https://x.com/\npage_type: about\n---\nbody', { status: 200 });
  }));
  return render(
    <QueryClientProvider client={client}>
      <PageWorkspaceProvider generation={gen}>
        <RecognizedPanel siteId="site-1" />
      </PageWorkspaceProvider>
    </QueryClientProvider>,
  );
}

describe('RecognizedPanel', () => {
  it('renders JSON-LD, Unfurl Preview, and Chatability sub-tab triggers', async () => {
    setup();
    expect(await screen.findByText('JSON-LD')).toBeInTheDocument();
    expect(screen.getByText('Unfurl Preview')).toBeInTheDocument();
    expect(screen.getByText('Chatability')).toBeInTheDocument();
  });
});
