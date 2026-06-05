import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PageWorkspaceProvider, usePageWorkspace } from './page-workspace-context';
import type { Generation } from '@/db/schema';

const replace = vi.fn();
let searchParams = new URLSearchParams('');
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/sites/uid-1',
  useSearchParams: () => searchParams,
}));

const gen = { id: 1, uid: 'g1', pagesStatus: 'succeeded' } as unknown as Generation;

function Probe() {
  const { selectedPath, setSelectedPath } = usePageWorkspace();
  return (
    <div>
      <span data-testid="sel">{selectedPath ?? 'none'}</span>
      <button onClick={() => setSelectedPath('services/branding')}>pick</button>
    </div>
  );
}

function renderWith(pagesPaths: string[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      new Response(
        JSON.stringify({
          status: 'succeeded',
          pages: pagesPaths.map((p) => ({ url: `https://x.com/${p}`, path: p, filename: p.split('/').pop(), status: 'ok', blobPath: null })),
        }),
        { status: 200 },
      ),
    ),
  );
  return render(
    <QueryClientProvider client={client}>
      <PageWorkspaceProvider generation={gen}>
        <Probe />
      </PageWorkspaceProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  replace.mockClear();
  searchParams = new URLSearchParams('');
});

describe('PageWorkspaceProvider URL backing', () => {
  it('selects the ?page= value when it is a known page', async () => {
    searchParams = new URLSearchParams('page=services%2Fbranding');
    renderWith(['index', 'services/branding']);
    expect(await screen.findByText('services/branding')).toBeInTheDocument();
  });

  it('falls back to index when ?page= is missing or unknown', async () => {
    searchParams = new URLSearchParams('page=does-not-exist');
    renderWith(['index', 'about']);
    expect(await screen.findByText('index')).toBeInTheDocument();
  });

  it('writes the encoded page to the URL on selection', async () => {
    renderWith(['index', 'services/branding']);
    await screen.findByText('index');
    fireEvent.click(screen.getByText('pick'));
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace.mock.calls[0][0]).toContain('page=services%2Fbranding');
    expect(replace.mock.calls[0][1]).toEqual({ scroll: false });
  });

  it('preserves other query params when writing the page', async () => {
    searchParams = new URLSearchParams('action=regenerate');
    renderWith(['index', 'services/branding']);
    await screen.findByText('index');
    fireEvent.click(screen.getByText('pick'));
    const written = replace.mock.calls[0][0] as string;
    expect(written).toContain('action=regenerate');
    expect(written).toContain('page=services%2Fbranding');
  });
});
