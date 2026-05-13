'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { CrawlerAuditTable } from './crawler-audit-table';
import { RobotsGenerator } from './robots-generator';
import {
  KNOWN_AI_BOTS,
  type AuditResults,
} from '@/lib/known-ai-bots';
import { formatRelativeTime } from '@/lib/format-time';
import type { CrawlerAudit } from '@/db/schema';

type AuditResponse = { audit: CrawlerAudit };

function emptyResults(): AuditResults {
  return Object.fromEntries(
    KNOWN_AI_BOTS.map((b) => [b, { status: 'default' as const }]),
  ) as AuditResults;
}

function summary(results: AuditResults) {
  let allowed = 0,
    blocked = 0,
    partial = 0,
    def = 0;
  for (const b of KNOWN_AI_BOTS) {
    const s = results[b].status;
    if (s === 'allowed') allowed++;
    else if (s === 'blocked') blocked++;
    else if (s === 'partial') partial++;
    else def++;
  }
  return { allowed, blocked, partial, default: def };
}

export function CrawlerAuditTab({ siteId }: { siteId: number }) {
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
      <div className="space-y-4 rounded-xl border border-hairline bg-surface-card p-6">
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-ink">AI Crawler Audit</h3>
          <p className="font-mono text-[12px] text-muted-strong">
            Last checked {formatRelativeTime(audit.fetchedAt)}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => reAudit.mutate()}
          disabled={reAudit.isPending}
        >
          {reAudit.isPending ? 'Auditing…' : 'Re-audit'}
        </Button>
      </div>

      {audit.status === 'failed' ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4">
          <div className="caption-uppercase mb-2 text-destructive">Audit failed</div>
          <p className="font-mono text-[13px] text-ink">
            {audit.errorMessage ?? 'Unknown error'}
          </p>
          <div className="mt-3">
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
        <>
          <SummaryChips counts={summary(results)} />
          <CrawlerAuditTable results={results} />
        </>
      )}

      <section className="space-y-3">
        <div>
          <h4 className="display-sm text-ink">Generate the directives you want</h4>
          <p className="text-sm text-muted-strong">
            Toggle each bot to ALLOW or BLOCK. Bots left as DEFAULT are omitted
            from the snippet.
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
  counts: { allowed: number; blocked: number; partial: number; default: number };
}) {
  return (
    <div className="font-mono text-[13px] text-body">
      {counts.allowed} allowed · {counts.blocked} blocked · {counts.partial} partial · {counts.default} default
    </div>
  );
}
