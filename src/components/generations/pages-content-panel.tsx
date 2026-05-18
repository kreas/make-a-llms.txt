'use client';

import { useState } from 'react';
import { FileText, Download } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import type { Generation } from '@/db/schema';
import { TabPanel } from '@/components/layout/tab-panel';
import { PagesTree, type ManifestPage } from './pages-tree';
import { PagesPreview } from './pages-preview';

type ManifestResponse =
  | { status: 'pending' | 'running'; pages: [] }
  | {
      status: 'succeeded' | 'cancelled';
      pages: ManifestPage[];
      successCount?: number;
      failedCount?: number;
      totalUrls?: number;
    }
  | { status: 'skipped' | 'failed'; reason?: string; pages: [] };

function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-[600px] flex-col items-center justify-center rounded-lg border border-hairline bg-surface-card p-8 text-center">
      <FileText className="h-8 w-8 text-muted-soft" />
      <p className="mt-4 text-base text-muted-strong">{children}</p>
    </div>
  );
}

export function PagesContentPanel({ generation }: { generation: Generation | null }) {
  const [selected, setSelected] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ['pagesManifest', generation?.id, generation?.pagesStatus],
    enabled:
      !!generation &&
      (generation.pagesStatus === 'succeeded' || generation.pagesStatus === 'cancelled'),
    queryFn: async (): Promise<ManifestResponse> => {
      const res = await fetch(`/api/generations/${generation!.uid}/pages`);
      if (!res.ok) throw new Error(`status ${res.status}`);
      return res.json() as Promise<ManifestResponse>;
    },
    staleTime: 30_000,
  });

  if (!generation) {
    return (
      <Placeholder>
        No generation selected. Pick one from the sidebar to view its pages.
      </Placeholder>
    );
  }
  if (generation.pagesStatus === 'pending' || generation.pagesStatus === 'running') {
    return <Placeholder>Rendering page Markdown…</Placeholder>;
  }
  if (generation.pagesStatus === 'skipped') {
    return (
      <Placeholder>
        Skipped — {generation.pagesErrorMessage ?? 'no eligible URLs.'}
      </Placeholder>
    );
  }
  if (generation.pagesStatus === 'failed') {
    return (
      <Placeholder>{generation.pagesErrorMessage ?? 'Page rendering failed.'}</Placeholder>
    );
  }

  const manifest = q.data && 'pages' in q.data ? q.data : null;
  const pages = (manifest?.pages ?? []) as ManifestPage[];
  const ok = pages.filter((p) => p.status === 'ok').length;
  const failed = pages.filter((p) => p.status === 'failed').length;
  const summary =
    generation.pagesStatus === 'cancelled'
      ? `Cancelled — ${ok} pages rendered before stop.`
      : `${ok} of ${pages.length} pages rendered${failed > 0 ? ` — ${failed} failed` : ''}`;

  return (
    <TabPanel
      meta={<p className="text-sm text-body">{summary}</p>}
      actions={
        <a
          href={`/api/generations/${generation.uid}/pages.zip`}
          className="inline-flex items-center gap-1.5 rounded border border-hairline-strong bg-surface-card px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-canvas-soft"
        >
          <Download className="h-3.5 w-3.5" />
          Download all (.zip)
        </a>
      }
      contentClassName="p-4"
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[280px_1fr]">
        <div className="h-[600px] overflow-auto rounded-lg border border-hairline bg-surface-card p-2">
          {q.isPending ? (
            <div className="p-2 text-body">Loading manifest…</div>
          ) : (
            <PagesTree pages={pages} selectedPath={selected} onSelect={setSelected} />
          )}
        </div>
        <PagesPreview generationId={generation.uid} selectedPath={selected} />
      </div>
    </TabPanel>
  );
}
