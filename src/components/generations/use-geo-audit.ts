'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { SerializedSiteGeoAudit } from '@/lib/geo-audit/serialize';

export type SiteType = 'saas' | 'ecommerce' | 'local' | 'publisher' | 'services' | 'other';
export type Goal = 'get-cited' | 'win-comparisons' | 'build-trust';

export type ClassifyResult = { suggestedType: SiteType; confidence: number };

export function useGeoAudit(siteId: string) {
  const queryClient = useQueryClient();
  const key = ['geo-audit', 'latest', siteId];

  const latest = useQuery({
    queryKey: key,
    queryFn: async (): Promise<{ audit: SerializedSiteGeoAudit | null }> => {
      const res = await fetch(`/api/sites/${siteId}/geo-audit/latest`);
      if (!res.ok) throw new Error('Failed to load GEO analysis');
      return res.json();
    },
    refetchInterval: (q) => {
      const s = (q.state.data as { audit: SerializedSiteGeoAudit | null } | undefined)?.audit?.status;
      return s === 'pending' || s === 'running' ? 3000 : false;
    },
  });

  const audit = latest.data?.audit ?? null;

  // Discovery (site-type classification) is a CACHED query — keyed by site,
  // staleTime Infinity — so it runs exactly once per site and survives any
  // component remount (the QueryClient lives at the app root). It only runs when
  // there is no audit yet, and always resolves to a usable value (falls back to
  // 'other' on error) so it never retries or loops.
  const discovery = useQuery({
    queryKey: ['geo-classify', siteId],
    queryFn: async (): Promise<ClassifyResult> => {
      try {
        const res = await fetch(`/api/sites/${siteId}/geo-audit/classify`, { method: 'POST' });
        if (!res.ok) throw new Error('classify failed');
        return (await res.json()) as ClassifyResult;
      } catch {
        return { suggestedType: 'other', confidence: 0 };
      }
    },
    enabled: !latest.isPending && audit === null,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  });

  const runMut = useMutation({
    mutationFn: async (input: { siteType: SiteType; goal: Goal }): Promise<SerializedSiteGeoAudit> => {
      const res = await fetch(`/api/sites/${siteId}/geo-audit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error('Analysis failed to start');
      const body = (await res.json()) as { audit: SerializedSiteGeoAudit };
      return body.audit;
    },
    onSuccess: (next) => {
      queryClient.setQueryData(key, { audit: next });
    },
  });

  return {
    audit,
    isLoading: latest.isPending,
    isError: latest.isError,
    suggested: discovery.data ?? null,
    discoveryLoading: discovery.isFetching,
    run: (input: { siteType: SiteType; goal: Goal }) => runMut.mutateAsync(input),
    runState: runMut,
  };
}
