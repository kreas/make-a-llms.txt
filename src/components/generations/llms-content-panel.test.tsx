import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { LlmsContentPanel } from './llms-content-panel';
import type { Generation } from '@/db/schema';

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
    render(<LlmsContentPanel generation={null} siteId="cccccccc-cccc-4ccc-8ccc-cccccccccccc" />);
    expect(screen.getByText(/no successful generation yet/i)).toBeInTheDocument();
  });

  it('fetches and displays content when a generation is provided', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('# llms.txt content', { status: 200 }),
      ),
    );

    render(<LlmsContentPanel generation={mkGen()} siteId="cccccccc-cccc-4ccc-8ccc-cccccccccccc" />);

    expect(await screen.findByText('# llms.txt content')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith('/api/generations/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/files/llms');
  });
});
