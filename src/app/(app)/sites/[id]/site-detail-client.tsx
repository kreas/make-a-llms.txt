'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { Settings, RefreshCw, Link as LinkIcon, Clock } from 'lucide-react';
import type { Site, Generation } from '@/db/schema';
import { ProcessTimeline } from '@/components/generations/process-timeline';
import { LlmsContentPanel } from '@/components/generations/llms-content-panel';
import { PagesContentPanel } from '@/components/generations/pages-content-panel';
import { GenerationsPopover } from '@/components/generations/generations-popover';
import { SettingsDialog } from '@/components/sites/settings-dialog';
import { CrawlerAuditTab } from '@/components/crawlers/crawler-audit-tab';
import { CitationsTab } from '@/components/citations/citations-tab';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatRelativeTime } from '@/lib/format-time';

export function SiteDetailClient({
  site,
  generations,
}: {
  site: Site;
  generations: Generation[];
}) {
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
    <Tabs defaultValue="llms" className="flex flex-col gap-8">
      <div className="flex flex-col gap-6">
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
              className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-hairline-strong bg-surface-card text-ink transition-colors hover:bg-canvas-soft"
            >
              <Settings className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">Settings</span>
            </button>
            <button
              type="button"
              onClick={() => regenerate.mutate()}
              disabled={regenerate.isPending}
              title="Re-run Generation"
              className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-primary text-canvas transition-colors hover:bg-primary-active disabled:opacity-50"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">Re-run Generation</span>
            </button>
          </div>
        </header>
        <TabsList>
          <TabsTrigger value="llms">llms.txt</TabsTrigger>
          <TabsTrigger value="pages">pages.md</TabsTrigger>
          <TabsTrigger value="crawlers">AI Crawlers</TabsTrigger>
          <TabsTrigger value="citations">Citations</TabsTrigger>
        </TabsList>
      </div>

      <div className="min-w-0">
        <TabsContent value="llms">
          <LlmsContentPanel generation={selected} siteId={site.uid} />
        </TabsContent>
        <TabsContent value="pages">
          <PagesContentPanel generation={selected} />
        </TabsContent>
        <TabsContent value="crawlers">
          <CrawlerAuditTab siteId={site.uid} />
        </TabsContent>
        <TabsContent value="citations">
          <CitationsTab siteId={site.uid} latestGenUid={latestSucceeded?.uid ?? null} />
        </TabsContent>
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
  );
}
