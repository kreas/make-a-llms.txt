'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { Settings, RefreshCw, Link as LinkIcon, Clock } from 'lucide-react';
import { motion } from 'framer-motion';
import type { Site, Generation } from '@/db/schema';
import { ProcessTimeline } from '@/components/generations/process-timeline';
import { LlmsContentPanel } from '@/components/generations/llms-content-panel';
import { PagesContentPanel } from '@/components/generations/pages-content-panel';
import { GenerationsPopover } from '@/components/generations/generations-popover';
import { SettingsDialog } from '@/components/sites/settings-dialog';
import { CrawlerAuditTab } from '@/components/crawlers/crawler-audit-tab';
import { CitationsTab } from '@/components/citations/citations-tab';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GooeyFilter } from '@/components/ui/gooey-filter';
import { useScreenSize } from '@/hooks/use-screen-size';
import { formatRelativeTime } from '@/lib/format-time';
import { cn } from '@/lib/utils';

const tabItems = [
  { value: 'pages', label: 'Pages' },
  { value: 'llms', label: 'llms.txt' },
  { value: 'crawlers', label: 'AI Crawlers' },
];

export function SiteDetailClient({
  site,
  generations,
}: {
  site: Site;
  generations: Generation[];
}) {
  const [activeTab, setActiveTab] = useState('pages');
  const screenSize = useScreenSize();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [freshToken, setFreshToken] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const latest = generations[0] ?? null;
  const latestSucceeded = generations.find((g) => g.status === 'succeeded') ?? null;
  const defaultSelectedId = latestSucceeded?.id ?? latest?.id ?? null;
  const [selectedId, setSelectedId] = useState<number | null>(defaultSelectedId as number | null);
  const selected = generations.find((g) => g.id === selectedId) ?? null;

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

  // Poll for status updates while any generation is in flight.
  useEffect(() => {
    const hasInFlight = generations.some(
      (g) => g.status === 'pending' || g.status === 'running',
    );
    if (!hasInFlight) return;
    const handle = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(handle);
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

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col gap-8 relative z-10">
      <header className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            {site.faviconUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={site.faviconUrl}
                alt=""
                className="h-7 w-7 rounded border border-hairline bg-surface-card object-contain"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
              />
            )}
            <h1 className="display-lg text-ink">{site.displayName ?? site.name}</h1>
            {generations.length > 0 && (
              <GenerationsPopover
                generations={generations}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            )}
          </div>
          {site.description && (
            <p className="max-w-2xl text-sm text-muted-strong">{site.description}</p>
          )}
          <div className="flex items-center gap-4 text-sm text-muted-strong">
            <a
              href={site.rootUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 font-mono text-[13px] transition-colors hover:text-ink"
            >
              <LinkIcon className="h-4 w-4" />
              {site.rootUrl}
            </a>
            {latest && (
              <>
                <span className="h-4 w-px bg-hairline" />
                <span className="flex items-center gap-1.5 font-mono text-[13px]">
                  <Clock className="h-3.5 w-3.5 text-muted-soft" />
                  Generated {formatRelativeTime(latest.createdAt)}
                </span>
              </>
            )}
          </div>
          {latest && <ProcessTimeline status={latest.status} />}
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            title="Settings"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-hairline-strong bg-surface-card text-ink transition-colors hover:bg-canvas-soft"
          >
            <Settings className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">Settings</span>
          </button>
          <button
            type="button"
            onClick={() => regenerate.mutate()}
            disabled={regenerate.isPending}
            title="Re-run Generation"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-on-primary transition-colors hover:bg-primary-active disabled:opacity-50"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">Re-run Generation</span>
          </button>
        </div>
      </header>

      {/* The Gooey Folder Container */}
      <div className="relative w-full">
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
                    <motion.div
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
              <TabsTrigger
                key={item.value}
                value={item.value}
                className={cn(
                  'flex-1 h-10 flex items-center justify-center transition-colors duration-200 outline-none',
                  'data-[state=active]:bg-transparent! data-[state=active]:shadow-none! data-[state=active]:border-transparent! dark:data-[state=active]:bg-transparent! dark:data-[state=active]:border-transparent!',
                  activeTab === item.value
                    ? 'text-ink font-semibold'
                    : 'text-muted-foreground hover:text-ink',
                )}
              >
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Content panel area */}
          <div className="p-4 md:p-6 min-w-0">
            <TabsContent value="pages" className="mt-0 outline-none">
              <PagesContentPanel generation={selected} siteId={site.uid} />
            </TabsContent>
            <TabsContent value="llms" className="mt-0 outline-none">
              <LlmsContentPanel generation={selected} siteId={site.uid} />
            </TabsContent>
            <TabsContent value="crawlers" className="mt-0 outline-none">
              <CrawlerAuditTab siteId={site.uid} />
            </TabsContent>
          </div>
        </div>
      </div>

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

    {/* Full-width illustration background image at the bottom, flush with the footer */}
    <div
      className="absolute bottom-0 left-1/2 w-screen -translate-x-1/2 aspect-[1024/438] bg-[url('/site-detail-cats.png')] bg-bottom bg-no-repeat bg-cover pointer-events-none -z-10"
    />
  </div>
  );
}
