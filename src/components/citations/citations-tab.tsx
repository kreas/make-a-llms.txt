'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TabPanel } from '@/components/layout/tab-panel';
import { CitationsPageTable } from './citations-page-table';
import { CitationsPageDetail } from './citations-page-detail';

type LatestRow = {
  pageUrl: string;
  score: number | null;
  tier: 'poor' | 'fair' | 'good' | 'excellent' | null;
  fetchedAt: string | null;
};

// ManifestPage shape from /api/generations/[id]/pages
type ManifestPage = { url: string; status: 'ok' | 'failed' | 'skipped' };
type ManifestResponse = { status: string; pages: ManifestPage[] };

export function CitationsTab({ siteId, latestGenUid }: { siteId: string; latestGenUid: string | null }) {
  const [selected, setSelected] = useState<string | null>(null);

  // Reuse the same endpoint as the pages.md tab: /api/generations/[uid]/pages
  const manifest = useQuery({
    queryKey: ['citation-audits', 'manifest-pages', siteId, latestGenUid],
    enabled: !!latestGenUid,
    queryFn: async (): Promise<ManifestResponse> => {
      const res = await fetch(`/api/generations/${latestGenUid}/pages`);
      if (!res.ok) return { status: 'failed', pages: [] };
      return res.json();
    },
  });

  const latest = useQuery({
    queryKey: ['citation-audits', 'latest', siteId],
    queryFn: async (): Promise<{ audits: { id: string; pageUrl: string; score: number | null; tier: LatestRow['tier']; fetchedAt: string; status: 'succeeded' | 'failed' }[] }> => {
      const res = await fetch(`/api/sites/${siteId}/citation-audits/latest`);
      if (!res.ok) throw new Error('Failed to load latest audits');
      return res.json();
    },
  });

  const pages = (manifest.data?.pages ?? []).filter((p) => p.status === 'ok');
  const byUrl = new Map(latest.data?.audits.map((a) => [a.pageUrl, a]) ?? []);
  const rows: LatestRow[] = pages.map((p) => {
    const a = byUrl.get(p.url);
    return {
      pageUrl: p.url,
      score: a?.status === 'succeeded' ? a.score : null,
      tier: a?.status === 'succeeded' ? a.tier : null,
      fetchedAt: a?.fetchedAt ?? null,
    };
  });

  return (
    <TabPanel>
      {selected ? (
        <CitationsPageDetail siteUid={siteId} pageUrl={selected} onBack={() => setSelected(null)} />
      ) : (
        <CitationsPageTable rows={rows} onSelect={setSelected} />
      )}
    </TabPanel>
  );
}
