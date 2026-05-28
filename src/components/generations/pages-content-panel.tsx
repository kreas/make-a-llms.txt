'use client';

import { useState, useEffect } from 'react';
import { FileText } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import type { Generation } from '@/db/schema';
import { TabPanel } from '@/components/layout/tab-panel';
import { PagesTree, type ManifestPage } from './pages-tree';
import { PagesPreview } from './pages-preview';
import { CitationsPageDetail } from '../citations/citations-page-detail';
import { PageQuestions } from '../citations/page-questions';
import {
  Menubar,
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
} from '@/components/ui/menubar';

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
    <div className="flex min-h-[400px] flex-col items-center justify-center p-8 text-center">
      <FileText className="h-8 w-8 text-muted-soft" />
      <p className="mt-4 text-base text-muted-strong">{children}</p>
    </div>
  );
}

export function PagesContentPanel({
  generation,
  siteId,
}: {
  generation: Generation | null;
  siteId: string;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [subTab, setSubTab] = useState('citation-audit');
  const [copyingState, setCopyingState] = useState(false);

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
  const pages = (manifest?.pages ?? []) as ManifestPage[];

  const selectedPage = pages.find((p) => p.path === selected);

  const markdownQuery = useQuery({
    queryKey: ['pageMd', generation?.uid, selected],
    enabled: !!selected && !!generation,
    queryFn: async () => {
      const res = await fetch(`/api/generations/${generation!.uid}/pages/${selected}`);
      if (!res.ok) throw new Error(`status ${res.status}`);
      return res.text();
    },
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (pages && pages.length > 0) {
      const currentValid = selected && pages.some((p) => p.path === selected);
      if (!currentValid) {
        const hasIndex = pages.some((p) => p.path === 'index');
        if (hasIndex) {
          setSelected('index');
        } else if (pages[0]?.path) {
          setSelected(pages[0].path);
        }
      }
    }
  }, [pages, selected]);

  const handleSavePage = () => {
    if (!selectedPage?.path || !generation) return;
    const a = document.createElement('a');
    a.href = `/api/generations/${generation.uid}/pages/${selectedPage.path}`;
    a.download = `${selectedPage.path.split('/').pop()}.md`;
    a.click();
  };

  const handleExportAll = () => {
    if (!generation) return;
    const a = document.createElement('a');
    a.href = `/api/generations/${generation.uid}/pages.zip`;
    a.download = 'pages.zip';
    a.click();
  };

  const handleCopyMarkdown = async () => {
    if (!markdownQuery.data) return;
    await navigator.clipboard.writeText(markdownQuery.data);
    setCopyingState(true);
    setTimeout(() => setCopyingState(false), 2000);
  };

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

  const ok = pages.filter((p) => p.status === 'ok').length;
  const failed = pages.filter((p) => p.status === 'failed').length;
  const summary =
    generation.pagesStatus === 'cancelled'
      ? `Cancelled — ${ok} pages rendered before stop.`
      : `${ok} of ${pages.length} pages rendered${failed > 0 ? ` — ${failed} failed` : ''}`;

  return (
    <TabPanel
      flat
      meta={<p className="text-sm text-body">{summary}</p>}
      contentClassName="p-0"
    >
      <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-[280px_1fr]">
        <div className="sticky top-4 max-h-[calc(100vh-2rem)] overflow-auto pb-4 md:pb-0 md:pr-6 border-b md:border-b-0 md:border-r border-hairline">
          {q.isPending ? (
            <div className="p-2 text-body">Loading manifest…</div>
          ) : (
            <PagesTree pages={pages} selectedPath={selected} onSelect={setSelected} />
          )}
        </div>
        <div className="min-w-0">
          {selected && selectedPage ? (
            <div className="flex flex-col gap-6">
              {/* Unified Tan Header & Menubar Box */}
              <div className="flex items-center justify-between bg-[#f3efdb] p-1 pl-4 rounded-lg border border-hairline w-full gap-4">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-4 w-4 text-muted-soft flex-shrink-0" />
                  <span className="font-mono text-[13px] font-medium text-ink truncate">
                    {selectedPage.path ? `${selectedPage.path}.md` : 'Page'}
                  </span>
                </div>

                <Menubar className="border-0 bg-transparent p-0 shadow-none flex-shrink-0">
                  <MenubarMenu>
                    <MenubarTrigger
                      isActive={subTab === 'citation-audit'}
                      onClick={() => setSubTab('citation-audit')}
                    >
                      Citation Audit
                    </MenubarTrigger>
                  </MenubarMenu>
                  <MenubarMenu>
                    <MenubarTrigger
                      isActive={subTab === 'markdown'}
                      onClick={() => setSubTab('markdown')}
                    >
                      pages.md
                    </MenubarTrigger>
                  </MenubarMenu>
                  <MenubarMenu>
                    <MenubarTrigger
                      isActive={subTab === 'questions'}
                      onClick={() => setSubTab('questions')}
                    >
                      Chatability
                    </MenubarTrigger>
                  </MenubarMenu>
                  <MenubarMenu>
                    <MenubarTrigger className="gap-1.5 cursor-pointer">
                      Export <span className="text-[10px] text-muted-strong">▼</span>
                    </MenubarTrigger>
                    <MenubarContent className="bg-surface-card border border-hairline shadow-md p-1 rounded-lg min-w-[160px]">
                      <MenubarItem
                        disabled={!markdownQuery.data}
                        onClick={handleSavePage}
                        className="cursor-pointer flex items-center justify-between text-muted-strong focus:text-ink focus:bg-canvas-soft py-1.5 px-3 rounded-md transition-colors"
                      >
                        Save page.md
                      </MenubarItem>
                      <MenubarItem
                        onClick={handleExportAll}
                        className="cursor-pointer flex items-center justify-between text-muted-strong focus:text-ink focus:bg-canvas-soft py-1.5 px-3 rounded-md transition-colors"
                      >
                        Export all pages
                      </MenubarItem>
                      <MenubarItem
                        disabled={!markdownQuery.data}
                        onClick={handleCopyMarkdown}
                        className="cursor-pointer flex items-center justify-between text-muted-strong focus:text-ink focus:bg-canvas-soft py-1.5 px-3 rounded-md transition-colors"
                      >
                        {copyingState ? 'Copied!' : 'Copy markdown'}
                      </MenubarItem>
                    </MenubarContent>
                  </MenubarMenu>
                </Menubar>
              </div>

              {/* Tab Contents */}
              <div className="outline-none">
                {subTab === 'citation-audit' && (
                  <CitationsPageDetail siteUid={siteId} pageUrl={selectedPage.url} />
                )}
                {subTab === 'markdown' && (
                  <PagesPreview
                    content={markdownQuery.data ?? null}
                    isLoading={markdownQuery.isLoading}
                    isError={markdownQuery.isError}
                  />
                )}
                {subTab === 'questions' && (
                  <PageQuestions siteId={siteId} pageUrl={selectedPage.url} />
                )}
              </div>
            </div>
          ) : (
            <div className="flex h-[400px] flex-col items-center justify-center p-8 text-center bg-canvas-soft rounded-lg border border-dashed border-hairline-strong">
              <FileText className="h-8 w-8 text-muted-soft" />
              <p className="mt-4 text-base text-muted-strong">
                Select a page from the tree to view its details.
              </p>
            </div>
          )}
        </div>
      </div>
    </TabPanel>
  );
}
