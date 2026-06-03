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

function routeMock(over: { audit?: unknown; classify?: unknown } = {}) {
  fetchMock.mockImplementation((url: string) => {
    if (String(url).includes('/geo-audit/classify')) {
      return Promise.resolve({ ok: true, json: async () => over.classify ?? { suggestedType: 'publisher', confidence: 0.9 } });
    }
    if (String(url).includes('/geo-audit/latest')) {
      return Promise.resolve({ ok: true, json: async () => ({ audit: over.audit ?? null }) });
    }
    return Promise.resolve({ ok: true, json: async () => ({ audit: { status: 'pending' } }) });
  });
}

describe('useGeoAudit', () => {
  it('loads the latest audit', async () => {
    routeMock({ audit: { status: 'succeeded', score: 70 } });
    const { result } = renderHook(() => useGeoAudit('site-1'), { wrapper: hookWrap() });
    await waitFor(() => expect(result.current.audit?.status).toBe('succeeded'));
  });

  it('auto-discovers the site type exactly once when there is no audit', async () => {
    routeMock({ audit: null, classify: { suggestedType: 'publisher', confidence: 0.9 } });
    const { result } = renderHook(() => useGeoAudit('site-1'), { wrapper: hookWrap() });
    await waitFor(() => expect(result.current.suggested?.suggestedType).toBe('publisher'));
    const classifyCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/geo-audit/classify'));
    expect(classifyCalls.length).toBe(1);
  });

  it('does not run discovery when an audit already exists', async () => {
    routeMock({ audit: { status: 'succeeded', score: 70 } });
    const { result } = renderHook(() => useGeoAudit('site-1'), { wrapper: hookWrap() });
    await waitFor(() => expect(result.current.audit).not.toBeNull());
    const classifyCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/geo-audit/classify'));
    expect(classifyCalls.length).toBe(0);
  });

  it('run() posts type + goal', async () => {
    routeMock({ audit: null });
    const { result } = renderHook(() => useGeoAudit('site-1'), { wrapper: hookWrap() });
    await result.current.run({ siteType: 'saas', goal: 'get-cited' });
    const call = fetchMock.mock.calls.find((c) => c[0] === '/api/sites/site-1/geo-audit');
    expect(call?.[1]?.method).toBe('POST');
    expect(JSON.parse(call?.[1]?.body)).toEqual({ siteType: 'saas', goal: 'get-cited' });
  });
});
