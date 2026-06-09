'use client';

import { useState } from 'react';
import { FileText, RefreshCw, Sparkles } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { TabPanel } from '@/components/layout/tab-panel';
import { PagesPreview } from './pages-preview';
import { CitationsPageDetail } from '../citations/citations-page-detail';
import { usePageWorkspace } from './page-workspace-context';
import { usePageMarkdown } from './use-page-markdown';
import {
  Menubar,
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
} from '@/components/ui/menubar';

function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center p-8 text-center">
      <FileText className="h-8 w-8 text-muted-soft" />
      <p className="mt-4 text-base text-muted-strong">{children}</p>
    </div>
  );
}

export function ReadablePanel({ siteId }: { siteId: string }) {
  const queryClient = useQueryClient();
  const { generation, pages, selectedPath } = usePageWorkspace();
  const [subTab, setSubTab] = useState<'citation-audit' | 'markdown'>('citation-audit');
  const [copyingState, setCopyingState] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [formatting, setFormatting] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const markdownQuery = usePageMarkdown(generation?.uid, selectedPath);

  const selectedPage = pages.find((p) => p.path === selectedPath);

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
        Skipped — {(generation as { pagesErrorMessage?: string }).pagesErrorMessage ?? 'no eligible URLs.'}
      </Placeholder>
    );
  }
  if (generation.pagesStatus === 'failed') {
    return (
      <Placeholder>
        {(generation as { pagesErrorMessage?: string }).pagesErrorMessage ?? 'Page rendering failed.'}
      </Placeholder>
    );
  }

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

  const handleRefresh = async () => {
    if (!selectedPage?.path || !generation) return;
    setRefreshing(true);
    setRefreshError(null);
    try {
      const res = await fetch(`/api/generations/${generation.uid}/pages/${selectedPage.path}`, {
        method: 'POST',
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        throw new Error(data.error?.message || `Status code ${res.status}`);
      }
      const updatedMarkdown = await res.text();
      queryClient.setQueryData(['pageMd', generation.uid, selectedPath], updatedMarkdown);
    } catch (err) {
      setRefreshError((err as Error).message || 'An error occurred while refreshing');
    } finally {
      setRefreshing(false);
    }
  };

  const handleFormatWithAi = async () => {
    if (!selectedPage?.path || !generation) return;
    setFormatting(true);
    setRefreshError(null);
    try {
      const res = await fetch(
        `/api/generations/${generation.uid}/pages/${selectedPage.path}?action=format`,
        { method: 'POST' },
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        throw new Error(data.error?.message || `Status code ${res.status}`);
      }
      const updatedMarkdown = await res.text();
      queryClient.setQueryData(['pageMd', generation.uid, selectedPath], updatedMarkdown);
    } catch (err) {
      setRefreshError((err as Error).message || 'An error occurred while formatting');
    } finally {
      setFormatting(false);
    }
  };

  return (
    <TabPanel
      flat
      contentClassName="p-0"
    >
      <div className="min-w-0">
          {selectedPath && selectedPage ? (
            <div className="flex flex-col gap-6">
              {/* Menubar Box */}
              <div className="flex items-center bg-[#f3efdb] p-1 rounded-lg border border-hairline w-full">
                <Menubar className="border-0 bg-transparent p-0 shadow-none">
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

              {/* Sub-view content */}
              <div className="outline-none">
                {subTab === 'citation-audit' && (
                  <CitationsPageDetail siteUid={siteId} pageUrl={selectedPage.url} />
                )}
                {subTab === 'markdown' && (
                  <div className="flex flex-col gap-4">
                    {refreshError && (
                      <div className="px-3 py-2 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
                        {refreshError}
                      </div>
                    )}
                    <PagesPreview
                      content={markdownQuery.data ?? null}
                      isLoading={markdownQuery.isLoading}
                      isError={markdownQuery.isError}
                      actions={
                        <>
                          <button
                            onClick={handleFormatWithAi}
                            disabled={formatting || refreshing || !markdownQuery.data}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-hairline rounded-md bg-surface-card hover:bg-canvas-soft disabled:opacity-50 transition-colors text-ink shadow-sm cursor-pointer"
                          >
                            <Sparkles className={`h-3.5 w-3.5 ${formatting ? 'animate-pulse' : ''}`} />
                            {formatting ? 'Formatting...' : 'Smart Format'}
                          </button>
                          <button
                            onClick={handleRefresh}
                            disabled={formatting || refreshing}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-hairline rounded-md bg-surface-card hover:bg-canvas-soft disabled:opacity-50 transition-colors text-ink shadow-sm cursor-pointer"
                          >
                            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                            {refreshing ? 'Refreshing...' : 'Refresh Page'}
                          </button>
                        </>
                      }
                    />
                  </div>
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
    </TabPanel>
  );
}
