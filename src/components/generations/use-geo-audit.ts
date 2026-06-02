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

  const classifyMut = useMutation({
    mutationFn: async (): Promise<ClassifyResult> => {
      const res = await fetch(`/api/sites/${siteId}/geo-audit/classify`, { method: 'POST' });
      if (!res.ok) throw new Error('Classification failed');
      return res.json();
    },
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
    onSuccess: (audit) => {
      queryClient.setQueryData(key, { audit });
    },
  });

  return {
    audit: latest.data?.audit ?? null,
    isLoading: latest.isPending,
    isError: latest.isError,
    classify: () => classifyMut.mutateAsync(),
    classifyState: classifyMut,
    run: (input: { siteType: SiteType; goal: Goal }) => runMut.mutateAsync(input),
    runState: runMut,
  };
}
