'use client';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import { TabPanel } from '@/components/layout/tab-panel';
import { CitationsPageTree, type CitationsPageRow } from './citations-page-tree';
import { CitationsPageDetail } from './citations-page-detail';

type ManifestPage = { url: string; path: string; status: 'ok' | 'failed' | 'skipped' };
type ManifestResponse = { status: string; count: number; pages: ManifestPage[] };

export function CitationsTab({ siteId, latestGenUid }: { siteId: string; latestGenUid: string | null }) {
  const [selected, setSelected] = useState<string | null>(null);

  const manifest = useQuery({
    queryKey: ['citation-audits', 'manifest-pages', siteId, latestGenUid],
    enabled: !!latestGenUid,
    queryFn: async (): Promise<ManifestResponse> => {
      const res = await fetch(`/api/generations/${latestGenUid}/pages`);
      if (!res.ok) return { status: 'failed', count: 0, pages: [] };
      return res.json();
    },
  });

  const latest = useQuery({
    queryKey: ['citation-audits', 'latest', siteId],
    queryFn: async (): Promise<{ audits: { id: string; pageUrl: string; score: number | null; tier: CitationsPageRow['tier']; fetchedAt: string; status: 'succeeded' | 'failed' }[] }> => {
      const res = await fetch(`/api/sites/${siteId}/citation-audits/latest`);
      if (!res.ok) throw new Error('Failed to load latest audits');
      return res.json();
    },
  });

  const pages = (manifest.data?.pages ?? []).filter((p) => p.status === 'ok');
  const byUrl = new Map(latest.data?.audits.map((a) => [a.pageUrl, a]) ?? []);
  const rows: CitationsPageRow[] = pages.map((p) => {
    const a = byUrl.get(p.url);
    return {
      pageUrl: p.url,
      score: a?.status === 'succeeded' ? a.score : null,
      tier: a?.status === 'succeeded' ? a.tier : null,
      fetchedAt: a?.fetchedAt ?? null,
    };
  });

  // Default to the first page when the manifest loads.
  useEffect(() => {
    if (!selected && rows.length > 0) {
      setSelected(rows[0].pageUrl);
    }
  }, [rows, selected]);

  return (
    <TabPanel contentClassName="p-4">
      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-[320px_1fr]">
        <div className="sticky top-4 max-h-[calc(100vh-2rem)] overflow-auto rounded-lg border border-hairline bg-surface-card">
          {manifest.isPending ? (
            <div className="p-4 text-sm text-body">Loading pages…</div>
          ) : rows.length === 0 ? (
            <div className="p-4 text-sm text-body">No pages available.</div>
          ) : (
            <CitationsPageTree rows={rows} selectedUrl={selected} onSelect={setSelected} />
          )}
        </div>
        <div className="min-w-0">
          {selected ? (
            <CitationsPageDetail siteUid={siteId} pageUrl={selected} />
          ) : (
            <div className="flex h-[600px] flex-col items-center justify-center rounded-lg border border-hairline bg-surface-card p-8 text-center">
              <FileText className="h-8 w-8 text-muted-soft" />
              <p className="mt-4 text-base text-muted-strong">Pick a page on the left to view its citation audit.</p>
            </div>
          )}
        </div>
      </div>
    </TabPanel>
  );
}
