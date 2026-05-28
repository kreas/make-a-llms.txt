'use client';

import { useState, useEffect, useMemo } from 'react';
import { FileText, RefreshCw, Sparkles, Copy, ChevronDown } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Generation } from '@/db/schema';
import { TabPanel } from '@/components/layout/tab-panel';
import { PagesTree, type ManifestPage } from './pages-tree';
import { PagesPreview } from './pages-preview';
import { CitationsPageDetail } from '../citations/citations-page-detail';
import { SchemaValidator } from './schema-validator';
import { UnfurlPreview } from './unfurl-preview';
import { PageQuestions } from '../citations/page-questions';
import {
  Menubar,
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
} from '@/components/ui/menubar';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';

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
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [subTab, setSubTab] = useState('citation-audit');
  const [copyingState, setCopyingState] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [formatting, setFormatting] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [copiedJsonLd, setCopiedJsonLd] = useState(false);

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

  const selectedPage = pages.find((p) => p.path === selected);

  const markdownQuery = useQuery({
    queryKey: ['pageMd', generation?.uid, selected],
    enabled: !!selected && !!generation,
    queryFn: async () => {
      const res = await fetch(`/api/generations/${generation!.uid}/pages/${selected}?t=${Date.now()}`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      return res.text();
    },
    staleTime: 5 * 60 * 1000,
  });

  const indexPageQuery = useQuery({
    queryKey: ['pageMd', generation?.uid, 'index'],
    enabled: !!generation && pages.some((p) => p.path === 'index'),
    queryFn: async () => {
      const res = await fetch(`/api/generations/${generation!.uid}/pages/index?t=${Date.now()}`, {
        cache: 'no-store',
      });
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
      queryClient.setQueryData(['pageMd', generation.uid, selected], updatedMarkdown);
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
      const res = await fetch(`/api/generations/${generation.uid}/pages/${selectedPage.path}?action=format`, {
        method: 'POST',
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        throw new Error(data.error?.message || `Status code ${res.status}`);
      }
      const updatedMarkdown = await res.text();
      queryClient.setQueryData(['pageMd', generation.uid, selected], updatedMarkdown);
    } catch (err) {
      setRefreshError((err as Error).message || 'An error occurred while formatting');
    } finally {
      setFormatting(false);
    }
  };

  const handleCopyJsonLd = async (jsonText: string) => {
    await navigator.clipboard.writeText(jsonText);
    setCopiedJsonLd(true);
    setTimeout(() => setCopiedJsonLd(false), 2000);
  };

  const generateJsonLd = (fields: Record<string, string>, body?: string) => {
    const title = fields['title'] || '';
    const description = fields['description'] || fields['summary'] || '';
    const url = fields['url'] || selectedPage?.url || '';
    const canonical = fields['canonical'] || url;
    const dateModified = fields['updated'] || '';

    const brandUrl = (() => {
      try {
        return new URL(canonical).origin;
      } catch {
        return '';
      }
    })();

    let bodyImageUrl: string | undefined = undefined;
    if (body && !fields['image'] && !fields['ogImage']) {
      // Find first markdown image: ![alt](url)
      const mdMatch = body.match(/!\[.*?\]\((.*?)\)/);
      if (mdMatch && mdMatch[1]) {
        bodyImageUrl = mdMatch[1];
      } else {
        // Find first HTML/JSX image: <img ... src="url"
        const htmlMatch = body.match(/<img\s+[^>]*?src=["'](.*?)["']/i);
        if (htmlMatch && htmlMatch[1]) {
          bodyImageUrl = htmlMatch[1];
        }
      }
    }

    if (bodyImageUrl) {
      bodyImageUrl = bodyImageUrl.trim().replace(/^['"]|['"]$/g, '');
      if (!bodyImageUrl.startsWith('http://') && !bodyImageUrl.startsWith('https://')) {
        if (brandUrl) {
          const cleanPath = bodyImageUrl.startsWith('/') ? bodyImageUrl : `/${bodyImageUrl}`;
          bodyImageUrl = `${brandUrl}${cleanPath}`;
        }
      }
    }

    const imageUrl = fields['image'] || fields['ogImage'] || bodyImageUrl || undefined;

    const getPageSchemaType = (): string => {
      const rawType = fields['page_type'] || '';
      if (rawType === 'blog') return 'BlogPosting';
      if (rawType === 'product') return 'Product';
      if (rawType === 'location') return 'Place';
      if (rawType === 'menu') return 'Menu';
      if (rawType === 'careers') return 'JobPosting';
      if (rawType === 'contact') return 'ContactPage';
      if (rawType === 'about') return 'AboutPage';

      // Fallback heuristics based on the URL path
      const pathLower = canonical.toLowerCase();
      if (pathLower.includes('/blog/') || pathLower.includes('/news/') || pathLower.includes('/article/') || pathLower.includes('/articles/') || pathLower.includes('/press/')) {
        return 'BlogPosting';
      }
      if (pathLower.includes('/product/') || pathLower.includes('/shop/') || pathLower.includes('/store/')) {
        return 'Product';
      }
      if (pathLower.includes('/contact')) {
        return 'ContactPage';
      }
      if (pathLower.includes('/about')) {
        return 'AboutPage';
      }
      if (pathLower.includes('/careers') || pathLower.includes('/jobs') || pathLower.includes('/careers/')) {
        return 'JobPosting';
      }

      const typeMap: Record<string, string> = {
        legal: 'WebPage',
        landing: 'WebPage',
        other: 'WebPage',
      };
      return typeMap[rawType] || 'WebPage';
    };
    const schemaType = getPageSchemaType();

    const getBrandName = () => {
      let segments: string[] = [];
      if (title.includes('|')) {
        segments = title.split('|').map((s) => s.trim());
      } else if (title.includes(' - ')) {
        segments = title.split(' - ').map((s) => s.trim());
      } else if (title.includes(' – ')) {
        segments = title.split(' – ').map((s) => s.trim());
      } else if (title.includes(' — ')) {
        segments = title.split(' — ').map((s) => s.trim());
      }

      try {
        const u = new URL(canonical);
        const hostBase = u.hostname.replace('www.', '').split('.')[0].toLowerCase();
        
        if (segments.length > 0) {
          const matchingSegment = segments.find(seg => seg.toLowerCase().includes(hostBase));
          if (matchingSegment) return matchingSegment;
          
          const isHome = u.pathname === '/' || u.pathname === '';
          if (isHome) {
            return segments[0];
          } else {
            return segments[segments.length - 1];
          }
        }
        return u.hostname.replace('www.', '');
      } catch {
        return segments[0] || 'Site Owner';
      }
    };
    const brandName = getBrandName();

    // Resolve publisher logo
    let logoUrl = imageUrl;

    if (indexPageQuery.data) {
      const { fields: indexFields, body: indexBody } = parseFrontmatterFieldsSafe(indexPageQuery.data);
      let homepageLogo = indexFields['logo'] || indexFields['image'] || indexFields['ogImage'];
      if (!homepageLogo && indexBody) {
        const mdMatch = indexBody.match(/!\[.*?\]\((.*?)\)/);
        if (mdMatch && mdMatch[1]) {
          homepageLogo = mdMatch[1];
        } else {
          const htmlMatch = indexBody.match(/<img\s+[^>]*?src=["'](.*?)["']/i);
          if (htmlMatch && htmlMatch[1]) {
            homepageLogo = htmlMatch[1];
          }
        }
      }

      if (homepageLogo) {
        homepageLogo = homepageLogo.trim().replace(/^['"]|['"]$/g, '');
        if (!homepageLogo.startsWith('http://') && !homepageLogo.startsWith('https://')) {
          if (brandUrl) {
            const cleanPath = homepageLogo.startsWith('/') ? homepageLogo : `/${homepageLogo}`;
            homepageLogo = `${brandUrl}${cleanPath}`;
          }
        }
        logoUrl = homepageLogo;
      }
    }

    if (!logoUrl || logoUrl.includes('favicon.ico')) {
      if (brandUrl) {
        if (brandUrl.includes('aiready.cat')) {
          logoUrl = `${brandUrl}/logo-v4.png`;
        } else {
          logoUrl = `${brandUrl}/logo.png`;
        }
      } else {
        logoUrl = undefined;
      }
    }

    const publisher = {
      '@type': 'Organization',
      name: brandName,
      ...(brandUrl ? { url: brandUrl } : {}),
      ...(logoUrl ? {
        logo: {
          '@type': 'ImageObject',
          url: logoUrl,
        },
      } : {}),
    };

    // Build the specific JSON-LD shape based on type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let jsonLd: Record<string, any> = {
      '@context': 'https://schema.org',
      '@type': schemaType,
    };

    if (schemaType === 'BlogPosting') {
      jsonLd = {
        ...jsonLd,
        headline: title,
        description: description,
        url: canonical,
        mainEntityOfPage: {
          '@type': 'WebPage',
          '@id': canonical,
        },
        ...(imageUrl ? { image: imageUrl } : {}),
        ...(dateModified ? { datePublished: dateModified, dateModified } : {}),
        author: {
          '@type': 'Organization',
          name: brandName,
        },
        publisher,
      };
    } else if (schemaType === 'Product') {
      jsonLd = {
        ...jsonLd,
        name: title,
        description: description,
        url: canonical,
        ...(imageUrl ? { image: imageUrl } : {}),
        brand: {
          '@type': 'Brand',
          name: brandName,
        },
      };
    } else if (schemaType === 'Place') {
      jsonLd = {
        ...jsonLd,
        name: title,
        description: description,
        url: canonical,
        ...(imageUrl ? { image: imageUrl } : {}),
      };
    } else if (schemaType === 'JobPosting') {
      jsonLd = {
        ...jsonLd,
        title: title,
        description: description,
        url: canonical,
        hiringOrganization: {
          '@type': 'Organization',
          name: brandName,
          ...(brandUrl ? { url: brandUrl } : {}),
        },
        ...(dateModified ? { datePosted: dateModified } : {}),
      };
    } else {
      // Default WebPage / AboutPage / ContactPage / Menu
      jsonLd = {
        ...jsonLd,
        name: title,
        description: description,
        url: canonical,
        ...(imageUrl ? { image: imageUrl } : {}),
        publisher,
      };
    }

    // Add abstract/summary if available and type is not Place/Product (which don't use abstract)
    if (fields['summary'] && schemaType !== 'Place' && schemaType !== 'Product') {
      jsonLd.abstract = fields['summary'];
    }

    return JSON.stringify(jsonLd, null, 2);
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
                        const jsonLdString = generateJsonLd(fields, body);
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

function parseFrontmatterFieldsSafe(markdown: string): { fields: Record<string, string>; body: string } {
  const fields: Record<string, string> = {};
  let body = markdown;
  let head = '';

  const trimmed = markdown.trim();
  if (trimmed.startsWith('---')) {
    let closing = trimmed.indexOf('\n---', 3);
    let delimiterLength = 4;
    if (closing === -1) {
      closing = trimmed.indexOf('\r\n---', 3);
      delimiterLength = 5;
    }
    if (closing !== -1) {
      let headStart = 3;
      if (trimmed[headStart] === '\r') headStart++;
      if (trimmed[headStart] === '\n') headStart++;
      head = trimmed.slice(headStart, closing);

      let bodyStart = closing + delimiterLength;
      if (trimmed[bodyStart] === '\r') bodyStart++;
      if (trimmed[bodyStart] === '\n') bodyStart++;
      body = trimmed.slice(bodyStart);
    }
  } else {
    const sepIndex = trimmed.indexOf('\n\n');
    if (sepIndex !== -1) {
      head = trimmed.slice(0, sepIndex);
      body = trimmed.slice(sepIndex + 2);
    } else {
      const crlfSepIndex = trimmed.indexOf('\r\n\r\n');
      if (crlfSepIndex !== -1) {
        head = trimmed.slice(0, crlfSepIndex);
        body = trimmed.slice(crlfSepIndex + 4);
      }
    }
  }

  if (head) {
    for (const line of head.split(/\r?\n/)) {
      const colon = line.indexOf(':');
      if (colon !== -1) {
        const key = line.slice(0, colon).trim();
        const value = line.slice(colon + 1).trim();
        fields[key] = value;
      }
    }
  }

  return { fields, body };
}

function highlightJson(json: string): string {
  const escaped = json
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return escaped.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      let cls = 'text-ink';
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = 'text-primary-base font-semibold';
        } else {
          cls = 'text-semantic-success';
        }
      } else if (/true|false/.test(match)) {
        cls = 'text-timeline-thinking font-medium';
      } else if (/null/.test(match)) {
        cls = 'text-muted-soft';
      } else {
        cls = 'text-timeline-grep';
      }
      return `<span class="${cls}">${match}</span>`;
    }
  );
}
