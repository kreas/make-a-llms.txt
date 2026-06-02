'use client';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Generation } from '@/db/schema';
import type { ManifestPage } from './pages-tree';

type ManifestResponse =
  | { status: 'pending' | 'running'; pages: [] }
  | { status: 'succeeded' | 'cancelled'; pages: ManifestPage[]; successCount?: number; failedCount?: number; totalUrls?: number }
  | { status: 'skipped' | 'failed'; reason?: string; pages: [] };

type Ctx = {
  generation: Generation | null;
  pages: ManifestPage[];
  manifestPending: boolean;
  selectedPath: string | null;
  setSelectedPath: (path: string) => void;
};

const PageWorkspaceContext = createContext<Ctx | null>(null);

export function PageWorkspaceProvider({
  generation,
  children,
}: {
  generation: Generation | null;
  children: React.ReactNode;
}) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

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

  const manifest = q.data && 'pages' in q.data ? q.data : null;
  const pages = useMemo(() => (manifest?.pages ?? []) as ManifestPage[], [manifest?.pages]);

  // Default the selection to index (or first page) once the manifest arrives.
  useEffect(() => {
    if (pages.length === 0) return;
    const valid = selectedPath && pages.some((p) => p.path === selectedPath);
    if (valid) return;
    const hasIndex = pages.some((p) => p.path === 'index');
    setSelectedPath(hasIndex ? 'index' : (pages[0]?.path ?? null));
  }, [pages, selectedPath]);

  const value = useMemo<Ctx>(
    () => ({ generation, pages, manifestPending: q.isPending, selectedPath, setSelectedPath }),
    [generation, pages, q.isPending, selectedPath],
  );

  return <PageWorkspaceContext.Provider value={value}>{children}</PageWorkspaceContext.Provider>;
}

export function usePageWorkspace(): Ctx {
  const ctx = useContext(PageWorkspaceContext);
  if (!ctx) throw new Error('usePageWorkspace must be used within PageWorkspaceProvider');
  return ctx;
}
