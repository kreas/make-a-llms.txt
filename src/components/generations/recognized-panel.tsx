'use client';

import { useState } from 'react';
import { FileText, Copy, ChevronDown } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { TabPanel } from '@/components/layout/tab-panel';
import { PagesTree } from './pages-tree';
import { UnfurlPreview } from './unfurl-preview';
import { PageQuestions } from '../citations/page-questions';
import { SchemaValidator } from './schema-validator';
import { usePageWorkspace } from './page-workspace-context';
import { usePageMarkdown } from './use-page-markdown';
import { generateJsonLd } from '@/lib/jsonld/generate';
import { highlightJson } from '@/lib/jsonld/highlight';
import { parseFrontmatterFieldsSafe } from '@/lib/markdown/frontmatter-fields';
import {
  Menubar,
  MenubarMenu,
  MenubarTrigger,
} from '@/components/ui/menubar';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';

function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center p-8 text-center">
      <FileText className="h-8 w-8 text-muted-soft" />
      <p className="mt-4 text-base text-muted-strong">{children}</p>
    </div>
  );
}

export function RecognizedPanel({ siteId }: { siteId: string }) {
  const { generation, pages, manifestPending, selectedPath, setSelectedPath } = usePageWorkspace();
  const [subTab, setSubTab] = useState<'json-ld' | 'unfurl' | 'questions'>('json-ld');
  const [copiedJsonLd, setCopiedJsonLd] = useState(false);

  const markdownQuery = usePageMarkdown(generation?.uid, selectedPath);

  const indexPageQuery = useQuery({
    queryKey: ['pageMd', generation?.uid, 'index'],
    enabled: !!generation && pages.some((p) => p.path === 'index'),
    queryFn: async () => {
      const res = await fetch(`/api/generations/${generation!.uid}/pages/index?t=${Date.now()}`);
      if (!res.ok) throw new Error(`status ${res.status}`);
      return res.text();
    },
    staleTime: 5 * 60 * 1000,
  });

  const selectedPage = pages.find((p) => p.path === selectedPath);

  const handleCopyJsonLd = async (jsonText: string) => {
    await navigator.clipboard.writeText(jsonText);
    setCopiedJsonLd(true);
    setTimeout(() => setCopiedJsonLd(false), 2000);
  };

  // Early return guards
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

  const ok = pages.filter((p) => p.status === 'ok').length;
  const failed = pages.filter((p) => p.status === 'failed').length;
  const summary =
    generation.pagesStatus === 'cancelled'
      ? `Cancelled — ${ok} pages rendered before stop.`
      : `${ok} of ${pages.length} pages rendered${failed > 0 ? ` — ${failed} failed` : ''}`;

  return (
    <TabPanel
      flat
      meta={
        <div className="flex flex-col gap-1 md:grid md:grid-cols-[280px_1fr] md:items-center md:gap-6">
          <p className="whitespace-nowrap text-sm text-body">{summary}</p>
          {selectedPath && selectedPage && (
            <span className="flex min-w-0 items-center gap-1.5 text-sm text-body">
              <FileText className="h-4 w-4 flex-shrink-0 text-muted-soft" />
              <span className="truncate">
                {selectedPage.path ? `${selectedPage.path.split('/').pop()}.md` : 'Page'}
              </span>
            </span>
          )}
        </div>
      }
      contentClassName="p-0"
    >
      <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-[280px_1fr]">
        <div className="sticky top-4 max-h-[calc(100vh-2rem)] overflow-auto pb-4 md:pb-0 md:pr-6 border-b md:border-b-0 md:border-r border-hairline">
          {manifestPending ? (
            <div className="p-2 text-body">Loading manifest…</div>
          ) : (
            <PagesTree pages={pages} selectedPath={selectedPath} onSelect={setSelectedPath} />
          )}
        </div>
        <div className="min-w-0">
          {selectedPath && selectedPage ? (
            <div className="flex flex-col gap-6">
              {/* Menubar Box */}
              <div className="flex items-center bg-[#f3efdb] p-1 rounded-lg border border-hairline w-full">
                <Menubar className="border-0 bg-transparent p-0 shadow-none">
                  <MenubarMenu>
                    <MenubarTrigger
                      isActive={subTab === 'json-ld'}
                      onClick={() => setSubTab('json-ld')}
                    >
                      JSON-LD
                    </MenubarTrigger>
                  </MenubarMenu>
                  <MenubarMenu>
                    <MenubarTrigger
                      isActive={subTab === 'unfurl'}
                      onClick={() => setSubTab('unfurl')}
                    >
                      Unfurl Preview
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
                </Menubar>
              </div>

              {/* Sub-view content */}
              <div className="outline-none">
                {subTab === 'json-ld' && (
                  <div className="flex flex-col gap-4 animate-fade-in-up">
                    {markdownQuery.isLoading ? (
                      <div className="flex min-h-[200px] items-center justify-center pt-4">
                        <p className="font-mono text-[13px] text-muted-soft animate-pulse">Loading…</p>
                      </div>
                    ) : markdownQuery.isError || !markdownQuery.data ? (
                      <div className="flex min-h-[200px] items-center justify-center pt-4">
                        <p className="text-sm text-destructive">Couldn&apos;t load page metadata.</p>
                      </div>
                    ) : (
                      (() => {
                        const { fields, body } = parseFrontmatterFieldsSafe(markdownQuery.data);
                        const jsonLdString = generateJsonLd({
                          fields,
                          body,
                          selectedPageUrl: selectedPage.url,
                          indexMarkdown: indexPageQuery.data ?? null,
                        });
                        return (
                          <div className="flex flex-col gap-6 w-full">
                            {/* Code Preview */}
                            <div className="bg-canvas-soft border border-hairline rounded-lg overflow-hidden flex flex-col">
                              <div className="flex justify-between items-center px-4 py-2 border-b border-hairline bg-surface-card/40 gap-2">
                                <span className="font-mono text-xs text-muted-strong">ld+json Schema</span>
                                <div className="flex items-center gap-2">
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-hairline rounded-md bg-surface-card hover:bg-canvas-soft transition-colors text-ink shadow-sm cursor-pointer select-none outline-none">
                                        <Copy className="h-3.5 w-3.5" />
                                        <span>{copiedJsonLd ? 'Copied!' : 'Copy Schema'}</span>
                                        <ChevronDown className="h-3 w-3 text-muted-soft" />
                                      </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="bg-surface-card border border-hairline shadow-md p-1 rounded-lg min-w-[170px] z-50">
                                      <DropdownMenuItem
                                        onClick={() => handleCopyJsonLd(jsonLdString)}
                                        className="cursor-pointer flex items-center justify-between text-muted-strong hover:text-ink hover:bg-canvas-soft/50 focus:text-ink focus:bg-canvas-soft/50 py-1.5 px-3 rounded-md transition-colors text-xs font-medium"
                                      >
                                        Copy raw JSON
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        onClick={() => handleCopyJsonLd(`<script type="application/ld+json">\n${jsonLdString}\n</script>`)}
                                        className="cursor-pointer flex items-center justify-between text-muted-strong hover:text-ink hover:bg-canvas-soft/50 focus:text-ink focus:bg-canvas-soft/50 py-1.5 px-3 rounded-md transition-colors text-xs font-medium"
                                      >
                                        Copy with HTML markup
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
                              </div>
                              <pre
                                className="whitespace-pre-wrap font-mono text-[13px] leading-relaxed text-body p-4 overflow-auto max-h-[400px]"
                                dangerouslySetInnerHTML={{ __html: highlightJson(jsonLdString) }}
                              />
                            </div>
                            {/* Local Validator */}
                            <SchemaValidator jsonLdString={jsonLdString} />
                          </div>
                        );
                      })()
                    )}
                  </div>
                )}
                {subTab === 'unfurl' && (
                  <div className="flex flex-col gap-4 animate-fade-in-up">
                    {markdownQuery.isLoading ? (
                      <div className="flex min-h-[200px] items-center justify-center pt-4">
                        <p className="font-mono text-[13px] text-muted-soft animate-pulse">Loading…</p>
                      </div>
                    ) : markdownQuery.isError || !markdownQuery.data ? (
                      <div className="flex min-h-[200px] items-center justify-center pt-4">
                        <p className="text-sm text-destructive">Couldn&apos;t load page metadata.</p>
                      </div>
                    ) : (
                      (() => {
                        const { fields } = parseFrontmatterFieldsSafe(markdownQuery.data);
                        return <UnfurlPreview fields={fields} selectedPage={selectedPage} />;
                      })()
                    )}
                  </div>
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
