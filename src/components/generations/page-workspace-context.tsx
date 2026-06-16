'use client';
import { createContext, useCallback, useContext, useMemo } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { Generation } from '@/db/schema';
import type { ManifestPage } from './pages-tree-data';

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
  onRefresh?: () => void;
  isRefreshing?: boolean;
};

const PageWorkspaceContext = createContext<Ctx | null>(null);
const PAGE_PARAM = 'page';

export function PageWorkspaceProvider({
  generation,
  selectParams,
  onRefresh,
  isRefreshing,
  children,
}: {
  generation: Generation | null;
  /** Extra query params written alongside ?page= on selection (e.g. force a tab). */
  selectParams?: Record<string, string>;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

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

  const urlPage = searchParams.get(PAGE_PARAM);

  // Effective selection: a valid ?page= wins; else index; else first page.
  const selectedPath = useMemo(() => {
    if (urlPage && pages.some((p) => p.path === urlPage)) return urlPage;
    if (pages.some((p) => p.path === 'index')) return 'index';
    return pages[0]?.path ?? null;
  }, [urlPage, pages]);

  const setSelectedPath = useCallback(
    (path: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set(PAGE_PARAM, path); // URLSearchParams encodes on toString()
      for (const [key, value] of Object.entries(selectParams ?? {})) {
        params.set(key, value);
      }
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams, selectParams],
  );

  const value = useMemo<Ctx>(
    () => ({ generation, pages, manifestPending: q.isPending, selectedPath, setSelectedPath, onRefresh, isRefreshing }),
    [generation, pages, q.isPending, selectedPath, setSelectedPath, onRefresh, isRefreshing],
  );

  return <PageWorkspaceContext.Provider value={value}>{children}</PageWorkspaceContext.Provider>;
}

export function usePageWorkspace(): Ctx {
  const ctx = useContext(PageWorkspaceContext);
  if (!ctx) throw new Error('usePageWorkspace must be used within PageWorkspaceProvider');
  return ctx;
}
