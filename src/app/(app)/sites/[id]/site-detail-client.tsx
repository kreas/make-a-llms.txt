'use client';

import { useEffect, useMemo, useState, Fragment } from 'react';
import { createPortal } from 'react-dom';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { Settings, Link as LinkIcon, Clock, RefreshCw } from 'lucide-react';
import { LazyMotion, m } from 'framer-motion';
import type { Site, Generation } from '@/db/schema';

const loadFeatures = () => import('framer-motion').then((mod) => mod.domMax);
import { OverviewPanel } from '@/components/generations/overview-panel';
import { ReadablePanel } from '@/components/generations/readable-panel';
import { RecognizedPanel } from '@/components/generations/recognized-panel';
import { SetupPanel } from '@/components/generations/setup-panel';
import { RecommendablePanel } from '@/components/generations/recommendable-panel';
import { PageWorkspaceProvider } from '@/components/generations/page-workspace-context';
import { PagesRail } from '@/components/generations/pages-rail';
import { useAppShellRail } from '@/components/layout/app-shell-rail';
import { GenerationsPopover } from '@/components/generations/generations-popover';
import { SettingsDialog } from '@/components/sites/settings-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GooeyFilter } from '@/components/ui/gooey-filter';
import { useScreenSize } from '@/hooks/use-screen-size';
import { formatRelativeTime } from '@/lib/format-time';
import { cn } from '@/lib/utils';

const tabItems: { value: string; label: string; isSetup?: boolean }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'readable', label: 'Readable' },
  { value: 'recommendable', label: 'Recommendable' },
  { value: 'recognized', label: 'Recognized' },
  { value: 'setup', label: 'Setup', isSetup: true },
];

export function SiteDetailClient({
  site,
  generations,
  allRunsCount = 0,
}: {
  site: Site;
  generations: (Generation & { projectRunNumber?: number })[];
  allRunsCount?: number;
}) {
  const [activeTab, setActiveTab] = useState('overview');
  const screenSize = useScreenSize();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { mount: railMount, setActive: setRailActive } = useAppShellRail();
  const [freshToken, setFreshToken] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // SSE live state merges real-time updates over the server-rendered props.
  const [liveGeneration, setLiveGeneration] = useState<Generation | null>(null);
  const mergedGenerations = useMemo(() => {
    if (!liveGeneration) return generations;
    return generations.map((g) => (g.id === liveGeneration.id ? { ...g, ...liveGeneration } : g));
  }, [generations, liveGeneration]);

  const latest = mergedGenerations[0] ?? null;
  const latestSucceeded = mergedGenerations.find((g) => g.status === 'succeeded') ?? null;
  const defaultSelectedId = latestSucceeded?.id ?? latest?.id ?? null;
  const [selectedId, setSelectedId] = useState<number | null>(defaultSelectedId as number | null);
  const selected = mergedGenerations.find((g) => g.id === selectedId) ?? null;

  // Register the AppShell right-rail column for this page (renders the pages tree).
  useEffect(() => {
    setRailActive(true);
    return () => setRailActive(false);
  }, [setRailActive]);

  useEffect(() => {
    const key = `fresh-token-${site.uid}`;
    const t = sessionStorage.getItem(key);
    if (t) {
      setFreshToken(t);
      sessionStorage.removeItem(key);
    }
  }, [site.uid]);

  const rotate = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/sites/${site.uid}/rotate-token`, { method: 'POST' });
      if (!res.ok) throw new Error('Rotate failed');
      return res.json() as Promise<{ webhookToken: string }>;
    },
    onSuccess: ({ webhookToken }) => setFreshToken(webhookToken),
  });

  type UpdateDetails = {
    name?: string;
    displayName?: string | null;
    description?: string | null;
  };

  const updateDetails = useMutation({
    mutationFn: async (update: UpdateDetails) => {
      const res = await fetch(`/api/sites/${site.uid}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(update),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        throw new Error(body?.error?.message ?? 'Failed to save changes');
      }
      return res.json();
    },
    onSuccess: () => router.refresh(),
  });

  const recaptureMetadata = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/sites/${site.uid}/refresh-metadata`, { method: 'POST' });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        throw new Error(body?.error?.message ?? 'Recapture failed');
      }
      return res.json();
    },
    onSuccess: () => router.refresh(),
  });

  const detailsError =
    (updateDetails.error as Error | null)?.message ??
    (recaptureMetadata.error as Error | null)?.message ??
    null;

  const regenerate = useMutation({
    mutationFn: async () => {
      // siteId in POST body must be the site's uid (UUID string)
      const res = await fetch('/api/generations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ siteId: site.uid, notifyEmail: false }),
      });
      if (!res.ok) throw new Error('Regenerate failed');
      return res.json() as Promise<{ generation: Generation }>;
    },
    onSuccess: ({ generation }) => {
      setSelectedId(generation.id);
      router.refresh();
    },
  });

  // Subscribe to SSE for the in-flight generation instead of polling.
  useEffect(() => {
    const inFlight = generations.find(
      (g) => g.status === 'pending' || g.status === 'running',
    );
    if (!inFlight) {
      setLiveGeneration(null);
      return;
    }
    const es = new EventSource(`/api/generations/${inFlight.uid}/stream`);
    es.addEventListener('status', (e) => {
      const next = JSON.parse((e as MessageEvent).data) as Partial<Generation>;
      setLiveGeneration((prev) => ({ ...(prev ?? inFlight), ...next }) as Generation);
      if (['succeeded', 'failed', 'cancelled'].includes(next.status ?? '')) {
        es.close();
        router.refresh();
      }
    });
    es.onerror = () => es.close();
    return () => es.close();
  }, [generations, router]);

  // Auto-trigger regenerate when arriving with ?action=regenerate from the dashboard's Run Now
  useEffect(() => {
    if (
      searchParams.get('action') === 'regenerate' &&
      !regenerate.isPending &&
      !latest?.status.match(/^(pending|running)$/)
    ) {
      regenerate.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  return (
    <div className="w-full pb-36 md:pb-48">
      {/* Background color of this page */}
      <div className="fixed inset-0 bg-[#f3efd9] -z-20 pointer-events-none" />

      <LazyMotion features={loadFeatures} strict>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col gap-8 relative z-10">
      {/* Compact secondary nav bar (single row): identity + meta on the left, actions on the right. */}
      <header className="flex items-center gap-3 border-b border-hairline pb-4">
        {site.faviconUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={site.faviconUrl}
            alt=""
            className="h-6 w-6 shrink-0 rounded border border-hairline bg-surface-card object-contain"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        )}
        <h1
          className="display-sm shrink-0 truncate text-ink"
          title={site.description ?? undefined}
        >
          {site.displayName ?? site.name}
        </h1>
        {generations.length > 0 && (
          <GenerationsPopover
            generations={generations}
            selectedId={selectedId}
            onSelect={setSelectedId}
            allRunsCount={allRunsCount}
          />
        )}

        {/* Compact metadata — hidden on smaller screens to keep the bar to one line */}
        <div className="ml-1 hidden min-w-0 items-center gap-3 text-[13px] text-muted-strong lg:flex">
          <span className="h-4 w-px shrink-0 bg-hairline" />
          <a
            href={site.rootUrl}
            target="_blank"
            rel="noreferrer"
            className="flex min-w-0 items-center gap-1 font-mono transition-colors hover:text-ink"
          >
            <LinkIcon className="h-4 w-4 shrink-0" />
            <span className="truncate">{site.rootUrl.replace(/^https?:\/\//, '')}</span>
          </a>
          {latest && (
            <span className="flex shrink-0 items-center gap-1.5 font-mono">
              <span className="h-4 w-px bg-hairline" />
              <Clock className="h-3.5 w-3.5 text-muted-soft" />
              Generated {formatRelativeTime(latest.createdAt)}
            </span>
          )}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {latest && (
            <button
              type="button"
              onClick={() => regenerate.mutate()}
              disabled={
                regenerate.isPending ||
                latest.status === 'pending' ||
                latest.status === 'running'
              }
              title="Re-run Generation"
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-hairline-strong bg-surface-card px-3 text-sm font-medium text-ink transition-colors hover:bg-canvas-soft disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw
                className={cn('h-4 w-4', regenerate.isPending && 'animate-spin')}
                aria-hidden="true"
              />
              <span className="hidden sm:inline">{regenerate.isPending ? 'Re-running…' : 'Re-run'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            title="Settings"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-strong transition-colors hover:bg-canvas-soft hover:text-ink cursor-pointer"
          >
            <Settings className="h-4.5 w-4.5" aria-hidden="true" />
            <span className="sr-only">Settings</span>
          </button>
        </div>
      </header>

      <PageWorkspaceProvider generation={selected}>
        {/* The Gooey Folder Container (center content; pages tree is portaled to the shell rail) */}
        <div className="relative w-full min-w-0">
            <GooeyFilter id="folder-gooey-filter" strength={screenSize.lessThan('md') ? 8 : 15} />

            {/* Layer 1: Visual backgrounds (filtered, with -top-8 offset to prevent gooey tab curve clipping) */}
            <div className="absolute -top-8 bottom-0 left-0 right-0 pointer-events-none filter drop-shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:drop-shadow-[0_8px_30px_rgba(0,0,0,0.2)]">
              <div
                className="w-full h-full"
                style={{ filter: 'url(#folder-gooey-filter)' }}
              >
                {/* Folder Tabs Headers track background (96px height with 56px padding top yields 40px tab height, positioned at y=24px from folder top) */}
                <div className="flex w-full h-[96px] pt-[56px]">
                  {tabItems.map((item, idx) => (
                    <div key={item.value} className="relative flex-1 h-full">
                      {activeTab === item.value && (
                        <m.div
                          layoutId="active-folder-tab-bg"
                          className={cn(
                            "absolute inset-y-0 bg-surface-card dark:bg-zinc-900",
                            idx === 0 ? "left-0 right-2 rounded-tr-2xl rounded-tl-none" :
                            idx === tabItems.length - 1 ? "left-2 right-0 rounded-tl-2xl rounded-tr-none" :
                            "left-2 right-2 rounded-t-2xl"
                          )}
                          transition={{
                            type: 'spring',
                            bounce: 0.0,
                            duration: 0.4,
                          }}
                        />
                      )}
                    </div>
                  ))}
                </div>
                {/* Card Body visual background (drawn below the header track, occupying parent height minus track height) */}
                <div
                  className={cn(
                    "w-full bg-surface-card dark:bg-zinc-900 rounded-b-2xl h-[calc(100%-96px)]",
                    activeTab === tabItems[0].value ? "rounded-tl-none" : "rounded-tl-2xl",
                    activeTab === tabItems[tabItems.length - 1].value ? "rounded-tr-none" : "rounded-tr-2xl"
                  )}
                />
              </div>
            </div>

            {/* Layer 2: Interactive controls & content panels (unfiltered, z-10) */}
            <div className="relative z-10 flex flex-col">
              {/* Interactive Triggers (Folder Tab Headers) */}
              <TabsList className="bg-transparent border-transparent p-0 flex w-full h-16! pt-6! group-data-[orientation=horizontal]/tabs:h-16 group-data-[orientation=horizontal]/tabs:pt-6">
                {tabItems.map((item) => (
                  <Fragment key={item.value}>
                    {item.isSetup && (
                      <span aria-hidden className="self-center mx-1 h-5 w-px bg-hairline-strong" />
                    )}
                    <TabsTrigger
                      value={item.value}
                      className={cn(
                        'flex-1 h-10 flex items-center justify-center transition-colors duration-200 outline-none',
                        'data-[state=active]:bg-transparent! data-[state=active]:shadow-none! data-[state=active]:border-transparent! dark:data-[state=active]:bg-transparent! dark:data-[state=active]:border-transparent!',
                        activeTab === item.value
                          ? 'text-ink font-semibold'
                          : 'text-muted-foreground hover:text-ink',
                        item.isSetup && 'opacity-70',
                      )}
                    >
                      {item.label}
                    </TabsTrigger>
                  </Fragment>
                ))}
              </TabsList>

              {/* Content panel area */}
              <div className="p-4 md:p-6 min-w-0 min-h-[600px]">
                <TabsContent value="overview" className="mt-0 outline-none">
                  <OverviewPanel siteId={site.uid} onNavigate={setActiveTab} />
                </TabsContent>
                <TabsContent value="readable" className="mt-0 outline-none">
                  <ReadablePanel siteId={site.uid} />
                </TabsContent>
                <TabsContent value="recommendable" className="mt-0 outline-none">
                  <RecommendablePanel siteId={site.uid} />
                </TabsContent>
                <TabsContent value="recognized" className="mt-0 outline-none">
                  <RecognizedPanel siteId={site.uid} />
                </TabsContent>
                <TabsContent value="setup" className="mt-0 outline-none">
                  <SetupPanel generation={selected} siteId={site.uid} />
                </TabsContent>
              </div>
            </div>
          </div>

          {/* Pages tree → portaled into the AppShell's full-height right rail column */}
          {railMount && createPortal(<PagesRail />, railMount)}
      </PageWorkspaceProvider>

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        siteId={site.uid}
        siteName={site.displayName ?? site.name}
        tokenPrefix={site.webhookTokenPrefix}
        freshToken={freshToken}
        onRotate={() => rotate.mutate()}
        isRotating={rotate.isPending}
        details={{
          name: site.name,
          displayName: site.displayName,
          description: site.description,
          faviconUrl: site.faviconUrl,
        }}
        onSaveDetails={(update) => updateDetails.mutate(update)}
        isSavingDetails={updateDetails.isPending}
        onRecaptureDetails={() => recaptureMetadata.mutate()}
        isRecapturing={recaptureMetadata.isPending}
        detailsError={detailsError}
      />
    </Tabs>
      </LazyMotion>

    {/* Full-width illustration background image at the bottom, fixed to viewport to prevent jumping */}
    <div
      className="fixed bottom-0 left-1/2 w-screen -translate-x-1/2 aspect-[1024/438] bg-[url('/site-detail-cats.png')] bg-bottom bg-no-repeat bg-cover pointer-events-none -z-10"
    />
  </div>
  );
}
