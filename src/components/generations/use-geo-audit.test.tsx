import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useGeoAudit } from './use-geo-audit';

const fetchMock = vi.fn();
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock); });

function hookWrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe('useGeoAudit', () => {
  it('loads the latest audit', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ audit: { status: 'succeeded', score: 70 } }) });
    const { result } = renderHook(() => useGeoAudit('site-1'), { wrapper: hookWrap() });
    await waitFor(() => expect(result.current.audit?.status).toBe('succeeded'));
  });

  it('classify() posts to the classify endpoint', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ audit: null }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ suggestedType: 'publisher', confidence: 0.9 }) });
    const { result } = renderHook(() => useGeoAudit('site-1'), { wrapper: hookWrap() });
    const res = await result.current.classify();
    expect(res.suggestedType).toBe('publisher');
    expect(fetchMock).toHaveBeenCalledWith('/api/sites/site-1/geo-audit/classify', { method: 'POST' });
  });

  it('run() posts type + goal', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ audit: null }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ audit: { status: 'pending' } }) });
    const { result } = renderHook(() => useGeoAudit('site-1'), { wrapper: hookWrap() });
    await result.current.run({ siteType: 'saas', goal: 'get-cited' });
    const call = fetchMock.mock.calls.find((c) => c[0] === '/api/sites/site-1/geo-audit');
    expect(call?.[1]?.method).toBe('POST');
    expect(JSON.parse(call?.[1]?.body)).toEqual({ siteType: 'saas', goal: 'get-cited' });
  });
});
