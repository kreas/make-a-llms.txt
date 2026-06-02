import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LlmsContentPanel } from './llms-content-panel';
import type { Generation } from '@/db/schema';

function renderWithQuery(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const mkGen = (over: Partial<Generation> = {}): Generation => ({
  id: 42,
  uid: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  siteId: 1,
  userId: 1,
  status: 'succeeded',
  trigger: 'manual',
  notifyEmail: false,
  notifiedAt: null,
  workflowRunId: null,
  resolvedSitemapUrl: null,
  llmsBlobPath: 'blob/path/llms.txt',
  llmsFullBlobPath: null,
  errorMessage: null,
  startedAt: null,
  completedAt: null,
  createdAt: '2026-05-07T00:00:00Z',
  updatedAt: '2026-05-07T00:00:00Z',
  ...over,
});

describe('LlmsContentPanel', () => {
  it('shows empty state when no generation is provided', () => {
    renderWithQuery(<LlmsContentPanel generation={null} siteId="cccccccc-cccc-4ccc-8ccc-cccccccccccc" />);
    expect(screen.getByText(/no successful generation yet/i)).toBeInTheDocument();
  });

  it('fetches and displays content when a generation is provided', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('# llms.txt content', { status: 200 }),
      ),
    );

    renderWithQuery(<LlmsContentPanel generation={mkGen()} siteId="cccccccc-cccc-4ccc-8ccc-cccccccccccc" />);

    expect(await screen.findByText('# llms.txt content')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith('/api/generations/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/files/llms');
  });

  it('calls POST endpoint when Rewrite with AI is clicked and updates content', async () => {
    const mockFetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith('/files/llms')) {
        return Promise.resolve(new Response('rough text', { status: 200 }));
      }
      if (url.endsWith('/rewrite') && init?.method === 'POST') {
        return Promise.resolve(new Response(JSON.stringify({ content: 'cleaned text' }), { status: 200 }));
      }
      return Promise.reject(new Error('Unknown endpoint'));
    });
    vi.stubGlobal('fetch', mockFetch);

    renderWithQuery(<LlmsContentPanel generation={mkGen()} siteId="cccccccc-cccc-4ccc-8ccc-cccccccccccc" />);

    // Wait for original content to load
    expect(await screen.findByText('rough text')).toBeInTheDocument();

    const rewriteBtn = screen.getByRole('button', { name: /smart format/i });
    await userEvent.click(rewriteBtn);

    // Wait for the content to update
    expect(await screen.findByText('cleaned text')).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledWith('/api/generations/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/rewrite', {
      method: 'POST',
    });
  });
});

