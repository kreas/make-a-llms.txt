'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Generation } from '@/db/schema';
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

export function PagesSection({ generation }: { generation: Generation }) {
  const [selected, setSelected] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ['pagesManifest', generation.id, generation.pagesStatus],
    queryFn: async (): Promise<ManifestResponse> => {
      const res = await fetch(`/api/generations/${generation.id}/pages`);
      if (!res.ok) throw new Error(`status ${res.status}`);
      return res.json() as Promise<ManifestResponse>;
    },
    staleTime: 30_000,
  });

  if (generation.pagesStatus === 'pending' || generation.pagesStatus === 'running') {
    return (
      <section className="flex flex-col gap-4 rounded-lg border border-hairline bg-surface-card p-6">
        <h2 className="caption-uppercase text-ink">Pages</h2>
        <div className="text-body">Rendering page Markdown…</div>
      </section>
    );
  }

  if (generation.pagesStatus === 'skipped') {
    return (
      <section className="flex flex-col gap-2 rounded-lg border border-hairline bg-surface-card p-6">
        <h2 className="caption-uppercase text-ink">Pages</h2>
        <p className="text-body">
          Skipped — {generation.pagesErrorMessage ?? 'no eligible URLs.'}
        </p>
      </section>
    );
  }

  if (generation.pagesStatus === 'failed') {
    return (
      <section className="flex flex-col gap-2 rounded-lg border border-hairline bg-surface-card p-6">
        <h2 className="caption-uppercase text-ink">Pages</h2>
        <p className="text-body">{generation.pagesErrorMessage ?? 'Page rendering failed.'}</p>
      </section>
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
    <section className="flex flex-col gap-4 rounded-lg border border-hairline bg-surface-card p-6">
      <div className="flex items-center justify-between">
        <h2 className="caption-uppercase text-ink">Pages</h2>
        <a
          href={`/api/generations/${generation.id}/pages.zip`}
          className="rounded border border-hairline-strong px-3 py-1 text-sm text-ink hover:bg-canvas-soft"
        >
          Download all (.zip)
        </a>
      </div>
      <p className="text-sm text-body">{summary}</p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[280px_1fr]">
        <div className="border-r border-hairline md:pr-2">
          {q.isPending ? (
            <div className="p-2 text-body">Loading manifest…</div>
          ) : (
            <PagesTree pages={pages} selectedPath={selected} onSelect={setSelected} />
          )}
        </div>
        <div className="min-h-[240px] border-l border-hairline md:pl-2">
          <PagesPreview generationId={generation.id} selectedPath={selected} />
        </div>
      </div>
    </section>
  );
}
