'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { Settings, RefreshCw, Link as LinkIcon, Clock } from 'lucide-react';
import type { Site, Generation } from '@/db/schema';
import { ProcessTimeline } from '@/components/generations/process-timeline';
import { LlmsContentPanel } from '@/components/generations/llms-content-panel';
import { WebhookBlock } from '@/components/sites/webhook-block';
import { GenerationsTable } from '@/components/generations/generations-table';
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

  const latest = generations[0] ?? null;
  const latestSucceeded = generations.find((g) => g.status === 'succeeded') ?? null;

  useEffect(() => {
    const key = `fresh-token-${site.id}`;
    const t = sessionStorage.getItem(key);
    if (t) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reading sessionStorage on mount; the conditional setState is intentional and not a cascading-render risk.
      setFreshToken(t);
      sessionStorage.removeItem(key);
    }
  }, [site.id]);

  const rotate = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/sites/${site.id}/rotate-token`, { method: 'POST' });
      if (!res.ok) throw new Error('Rotate failed');
      return res.json() as Promise<{ webhookToken: string }>;
    },
    onSuccess: ({ webhookToken }) => setFreshToken(webhookToken),
  });

  const regenerate = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/generations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ siteId: site.id, notifyEmail: false }),
      });
      if (!res.ok) throw new Error('Regenerate failed');
      return res.json() as Promise<{ generation: { id: number } }>;
    },
    onSuccess: ({ generation }) => router.push(`/g/${generation.id}`),
  });

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
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-6 border-b border-hairline pb-6 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <h1 className="display-lg text-ink">{site.name}</h1>
            {latest && (
              <span className="caption-uppercase rounded-full border border-hairline bg-surface-strong px-2 py-1 text-ink">
                #{latest.id}
              </span>
            )}
          </div>
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
            className="inline-flex h-10 items-center gap-2 rounded-md border border-hairline-strong bg-surface-card px-4 text-sm font-medium text-ink transition-colors hover:bg-canvas-soft"
            disabled
            aria-disabled
            title="Coming soon"
          >
            <Settings className="h-4 w-4" />
            Settings
          </button>
          <button
            type="button"
            onClick={() => regenerate.mutate()}
            disabled={regenerate.isPending}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-canvas transition-colors hover:bg-primary-active disabled:opacity-50"
          >
            <RefreshCw className="h-4 w-4" />
            Re-run Generation
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <LlmsContentPanel generation={latestSucceeded} siteId={site.id} />
        <div className="flex flex-col gap-6">
          <WebhookBlock
            siteId={site.id}
            tokenPrefix={site.webhookTokenPrefix}
            freshToken={freshToken ?? undefined}
            onRotate={() => rotate.mutate()}
          />
          <div className="rounded-lg border border-hairline bg-surface-card p-6">
            <h2 className="text-lg font-semibold text-ink">Generation History</h2>
            <div className="mt-4">
              <GenerationsTable generations={generations} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
