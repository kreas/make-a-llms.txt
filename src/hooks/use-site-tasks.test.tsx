import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSiteTasks, useCreateSiteTask, useUpdateSiteTaskStatus } from './use-site-tasks';

const TASK = {
  id: 't1', sourceType: 'citation-check', sourceId: 'schema-type',
  pageUrl: 'https://x.com/about', title: 'Schema.org type',
  foundText: '', fixText: '', status: 'open',
  createdAt: '2026-06-09T00:00:00Z', statusChangedAt: '2026-06-09T00:00:00Z',
};

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ tasks: [TASK] }), { status: 200 })));
});

describe('useSiteTasks', () => {
  it('fetches the site task list', async () => {
    const { result } = renderHook(() => useSiteTasks('site-1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.tasks).toHaveLength(1);
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('/api/sites/site-1/tasks');
  });
});

describe('useCreateSiteTask', () => {
  it('POSTs the finding payload', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ task: TASK }), { status: 200 })));
    const { result } = renderHook(() => useCreateSiteTask('site-1'), { wrapper });
    result.current.mutate({
      sourceType: 'citation-check', sourceId: 'schema-type',
      pageUrl: 'https://x.com/about', title: 'Schema.org type', foundText: '', fixText: '',
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('/api/sites/site-1/tasks');
    expect((init as RequestInit).method).toBe('POST');
  });
});

describe('useUpdateSiteTaskStatus', () => {
  it('PATCHes the task status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ task: { ...TASK, status: 'done' } }), { status: 200 })));
    const { result } = renderHook(() => useUpdateSiteTaskStatus('site-1'), { wrapper });
    result.current.mutate({ taskId: 't1', status: 'done' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('/api/sites/site-1/tasks/t1');
    expect((init as RequestInit).method).toBe('PATCH');
  });
});
