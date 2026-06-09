'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { Settings, ExternalLink } from 'lucide-react';
import type { Site, Generation } from '@/db/schema';
import { OverviewPanel } from '@/components/generations/overview-panel';
import { ReadablePanel } from '@/components/generations/readable-panel';
import { RecognizedPanel } from '@/components/generations/recognized-panel';
import { SetupPanel } from '@/components/generations/setup-panel';
import { RecommendablePanel } from '@/components/generations/recommendable-panel';
import { PageWorkspaceProvider } from '@/components/generations/page-workspace-context';
import { PagesRail } from '@/components/generations/pages-rail';
import { useAppShellRail } from '@/components/layout/app-shell-rail';
import { useAppShellHeader } from '@/components/layout/app-shell-header';
import { useAppShellSidebarSlot } from '@/components/layout/app-shell-sidebar-slot';
import { SettingsDialog } from '@/components/sites/settings-dialog';
import { TasksPanel } from '@/components/tasks/tasks-panel';
import { useSiteTasks } from '@/hooks/use-site-tasks';
import { cn } from '@/lib/utils';

const TAB_PARAM = 'tab';
const VALID_TABS = ['overview', 'readable', 'recommendable', 'recognized', 'setup', 'tasks'] as const;
type TabValue = (typeof VALID_TABS)[number];

// Clicking a page in the tree should always land on the Readable panel (citation audit).
// Hoisted so the provider's setSelectedPath callback stays referentially stable.
const SELECT_PAGE_PARAMS = { [TAB_PARAM]: 'readable' };

const tabItems: { value: TabValue; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'readable', label: 'Readable' },
  { value: 'recommendable', label: 'Recommendable' },
  { value: 'recognized', label: 'Recognized' },
  { value: 'setup', label: 'Setup' },
  { value: 'tasks', label: 'Tasks' },
];

export function SiteDetailClient({
  site,
  generations,
}: {
  site: Site;
  generations: (Generation & { projectRunNumber?: number })[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { mount: railMount, setActive: setRailActive } = useAppShellRail();
  const { mount: headerMount, setActive: setHeaderActive } = useAppShellHeader();
  const { mount: sidebarMount, setActive: setSidebarActive } = useAppShellSidebarSlot();
  const [freshToken, setFreshToken] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const siteTasksQuery = useSiteTasks(site.uid);
  const openTaskCount = siteTasksQuery.data?.tasks.filter((t) => t.status === 'open').length ?? 0;

  // Derive active tab from URL — defaults to 'overview'.
  const tabParam = searchParams.get(TAB_PARAM);
  const activeTab: TabValue =
    tabParam && (VALID_TABS as readonly string[]).includes(tabParam)
      ? (tabParam as TabValue)
      : 'overview';

  const setActiveTab = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set(TAB_PARAM, value);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  // SSE live state merges real-time updates over the server-rendered props.
  const [liveGeneration, setLiveGeneration] = useState<Generation | null>(null);
  const mergedGenerations = useMemo(() => {
    if (!liveGeneration) return generations;
    return generations.map((g) => (g.id === liveGeneration.id ? { ...g, ...liveGeneration } : g));
  }, [generations, liveGeneration]);

  const latest = mergedGenerations[0] ?? null;
  const latestSucceeded = mergedGenerations.find((g) => g.status === 'succeeded') ?? null;
  const defaultSelectedId = latestSucceeded?.id ?? latest?.id ?? null;
  const [selectedId] = useState<number | null>(defaultSelectedId as number | null);
  const selected = mergedGenerations.find((g) => g.id === selectedId) ?? null;

  // Register the AppShell right-rail column, full-width page header, and sidebar slot.
  useEffect(() => {
    setRailActive(true);
    return () => setRailActive(false);
  }, [setRailActive]);

  useEffect(() => {
    setHeaderActive(true);
    return () => setHeaderActive(false);
  }, [setHeaderActive]);

  useEffect(() => {
    setSidebarActive(true);
    return () => setSidebarActive(false);
  }, [setSidebarActive]);

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

  type UpdateDetails = { name?: string; displayName?: string | null; description?: string | null };

  const updateDetails = useMutation({
    mutationFn: async (update: UpdateDetails) => {
      const res = await fetch(`/api/sites/${site.uid}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(update),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
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
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
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
      const res = await fetch('/api/generations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ siteId: site.uid, notifyEmail: false }),
      });
      if (!res.ok) throw new Error('Regenerate failed');
      return res.json() as Promise<{ generation: Generation }>;
    },
    onSuccess: () => router.refresh(),
  });

  // Subscribe to SSE for the in-flight generation instead of polling.
  useEffect(() => {
    const inFlight = generations.find((g) => g.status === 'pending' || g.status === 'running');
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

  // Auto-trigger regenerate when arriving with ?action=regenerate from the dashboard.
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

      {/*
        Page header — portaled into the AppShell's full-width header slot so it spans
        both the content area and the right-rail column.
      */}
      {headerMount && createPortal(
        <header className="flex items-center gap-3 border-b border-hairline px-6 py-3 md:px-8">
          {site.faviconUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={site.faviconUrl}
              alt=""
              className="h-6 w-6 shrink-0 rounded border border-hairline bg-surface-card object-contain"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            />
          )}
          <h1 className="display-sm shrink-0 truncate text-ink" title={site.description ?? undefined}>
            {site.displayName ?? site.name}
          </h1>
          <a
            href={site.rootUrl}
            target="_blank"
            rel="noreferrer"
            title={site.rootUrl}
            className="text-muted-strong transition-colors hover:text-ink"
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">Open {site.rootUrl}</span>
          </a>
          <div className="ml-auto flex shrink-0 items-center gap-2">
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
        </header>,
        headerMount
      )}

      {/*
        Sidebar nav — portaled into the AppShell sidebar slot, replacing the generic
        "Websites" link with this site's name and the panel tabs as sub-links.
      */}
      {sidebarMount && createPortal(
        <div className="flex flex-col gap-0.5">
          {/* Site identity row */}
          <div className="flex items-center gap-2.5 px-2.5 py-2">
            {site.faviconUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={site.faviconUrl}
                alt=""
                className="h-4 w-4 shrink-0 rounded object-contain"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
              />
            ) : (
              <span className="h-4 w-4 shrink-0" />
            )}
            <span className="truncate text-sm font-medium text-ink">
              {site.displayName ?? site.name}
            </span>
          </div>

          {/* Tab links — sub-items indented under the site name */}
          {tabItems.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setActiveTab(tab.value as string)}
              className={cn(
                'flex w-full items-center rounded-lg pl-9 pr-2.5 py-2 text-sm text-left transition-colors',
                activeTab === tab.value
                  ? 'bg-surface-strong font-medium text-ink'
                  : 'text-body hover:bg-surface-card',
              )}
            >
              {tab.label}
              {tab.value === 'tasks' && openTaskCount > 0 && (
                <span className="ml-auto rounded-full border border-hairline bg-surface-card px-1.5 py-px text-[10px] font-semibold text-muted-strong">
                  {openTaskCount}
                </span>
              )}
            </button>
          ))}
        </div>,
        sidebarMount
      )}

      <PageWorkspaceProvider generation={selected} selectParams={SELECT_PAGE_PARAMS}>
        {/* Content card — mirrors the pages rail card style */}
        <div className="rounded-2xl border border-hairline bg-surface-card shadow-[0_8px_30px_rgba(0,0,0,0.05)]">
          <div className="p-4 md:p-6 min-h-[400px]">
            {activeTab === 'overview' && <OverviewPanel siteId={site.uid} onNavigate={setActiveTab} />}
            {activeTab === 'readable' && <ReadablePanel siteId={site.uid} />}
            {activeTab === 'recommendable' && <RecommendablePanel siteId={site.uid} />}
            {activeTab === 'recognized' && <RecognizedPanel siteId={site.uid} />}
            {activeTab === 'setup' && <SetupPanel generation={selected} siteId={site.uid} />}
            {activeTab === 'tasks' && <TasksPanel siteUid={site.uid} />}
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

      {/* Full-width illustration background at the bottom, fixed to viewport */}
      <div className="fixed bottom-0 left-1/2 w-screen -translate-x-1/2 aspect-[1024/438] bg-[url('/site-detail-cats.png')] bg-bottom bg-no-repeat bg-cover pointer-events-none -z-10" />
    </div>
  );
}
