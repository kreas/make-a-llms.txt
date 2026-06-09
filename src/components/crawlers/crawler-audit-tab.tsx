'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { TabPanel } from '@/components/layout/tab-panel';
import {
  CrawlerAuditTable,
  type CrawlerAuditRow,
  type EffectiveStatus,
} from './crawler-audit-table';
import { RobotsGenerator } from './robots-generator';
import {
  KNOWN_AI_BOTS,
  type AuditBotResult,
  type AuditResults,
} from '@/lib/known-ai-bots';
import { formatRelativeTime } from '@/lib/format-time';
import {
  wildcardPosture,
  type WildcardPosture,
} from '@/lib/robots-wildcard';
import type { CrawlerAudit } from '@/db/schema';

type AuditResponse = { audit: CrawlerAudit };

function emptyResults(): AuditResults {
  return Object.fromEntries(
    KNOWN_AI_BOTS.map((b) => [b, { status: 'default' as const }]),
  ) as AuditResults;
}

function effectiveStatus(
  result: AuditBotResult,
  wildcard: WildcardPosture,
): { status: EffectiveStatus; reason?: string } {
  if (result.status === 'allowed') return { status: 'allowed' };
  if (result.status === 'blocked') return { status: 'blocked' };
  if (result.status === 'partial') {
    return {
      status: 'partial',
      reason: result.disallowedPaths?.length
        ? `Blocked paths: ${result.disallowedPaths.join(', ')}`
        : 'Some paths are disallowed',
    };
  }
  // result.status === 'default' — derive from wildcard
  if (wildcard === 'disallow') {
    return { status: 'blocked', reason: 'Inherits block from User-agent: *' };
  }
  return {
    status: 'allowed',
    reason:
      wildcard === 'allow'
        ? 'Inherits allow from User-agent: *'
        : 'No rule found in robots.txt',
  };
}

function buildRows(
  results: AuditResults,
  wildcard: WildcardPosture,
): CrawlerAuditRow[] {
  return KNOWN_AI_BOTS.map((bot) => {
    const { status, reason } = effectiveStatus(results[bot], wildcard);
    return { bot, status, reason };
  });
}

function summary(rows: CrawlerAuditRow[]) {
  let allowed = 0,
    blocked = 0,
    partial = 0;
  for (const r of rows) {
    if (r.status === 'allowed') allowed++;
    else if (r.status === 'blocked') blocked++;
    else partial++;
  }
  return { allowed, blocked, partial };
}

export function CrawlerAuditTab({ siteId }: { siteId: string }) {
  const qc = useQueryClient();
  const key = ['sites', siteId, 'audit', 'latest'] as const;

  const latest = useQuery({
    queryKey: key,
    queryFn: async (): Promise<AuditResponse | null> => {
      const res = await fetch(`/api/sites/${siteId}/audits/latest`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
  });

  const audit = latest.data?.audit ?? null;

  const reAudit = useMutation({
    mutationFn: async (): Promise<void> => {
      const res = await fetch(`/api/sites/${siteId}/audits`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  if (latest.isLoading) {
    return <div className="py-8 font-mono text-sm text-muted-strong">Loading audit…</div>;
  }

  if (!audit) {
    return (
      <div className="space-y-4 p-6">
        <h3 className="text-lg font-semibold text-ink">AI Crawler Audit</h3>
        <p className="text-sm text-body">
          No audit yet. Click below to check your robots.txt against the nine
          known AI crawlers.
        </p>
        <Button
          onClick={() => reAudit.mutate()}
          disabled={reAudit.isPending}
        >
          {reAudit.isPending ? 'Running…' : 'Run audit now'}
        </Button>
      </div>
    );
  }

  const results: AuditResults = audit.status === 'succeeded'
    ? (JSON.parse(audit.results) as AuditResults)
    : emptyResults();

  const wildcard = wildcardPosture(audit.robotsContent ?? null);
  const rows = buildRows(results, wildcard);
  const counts = summary(rows);

  return (
    <div className="space-y-6">
      {audit.status === 'failed' ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4">
          <div className="caption-uppercase mb-2 text-destructive">Audit failed</div>
          <p className="font-mono text-[13px] text-ink">
            {audit.errorMessage ?? 'Unknown error'}
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="font-mono text-[12px] text-muted-strong">
              Last checked {formatRelativeTime(audit.fetchedAt)}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => reAudit.mutate()}
              disabled={reAudit.isPending}
            >
              Retry
            </Button>
          </div>
        </div>
      ) : (
        <TabPanel
          flat
          meta={
            <div className="flex flex-wrap items-center gap-4">
              <p className="font-mono text-[12px] text-muted-strong">
                Last checked {formatRelativeTime(audit.fetchedAt)}
              </p>
              <SummaryChips counts={counts} />
            </div>
          }
          actions={
            <Button
              variant="outline"
              size="sm"
              onClick={() => reAudit.mutate()}
              disabled={reAudit.isPending}
            >
              {reAudit.isPending ? 'Auditing…' : 'Re-audit'}
            </Button>
          }
          contentClassName="p-0 overflow-hidden"
        >
          <CrawlerAuditTable rows={rows} siteUid={siteId} />
        </TabPanel>
      )}

      <section className="space-y-3">
        <div>
          <h4 className="display-sm text-ink">Set who can crawl your site</h4>
          <p className="text-sm text-muted-strong">
            Mark each AI bot Allow or Block. Anything you don&apos;t change keeps your current setting.
          </p>
        </div>
        <RobotsGenerator
          siteId={siteId}
          initial={results}
          robotsContent={audit?.robotsContent ?? null}
        />
      </section>
    </div>
  );
}

function SummaryChips({
  counts,
}: {
  counts: { allowed: number; blocked: number; partial: number };
}) {
  return (
    <div className="font-mono text-[13px] text-body">
      {counts.allowed} allowed · {counts.blocked} blocked · {counts.partial} partial
    </div>
  );
}
