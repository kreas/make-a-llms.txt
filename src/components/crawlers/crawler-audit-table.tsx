import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export type EffectiveStatus = 'allowed' | 'blocked' | 'partial';

export type CrawlerAuditRow = {
  bot: string;
  status: EffectiveStatus;
  reason?: string;
};

const STATUS_PILL: Record<EffectiveStatus, { label: string; className: string }> = {
  allowed: {
    label: 'ALLOWED',
    className: 'bg-semantic-success/20 text-[#155e44]',
  },
  blocked: {
    label: 'BLOCKED',
    className: 'bg-destructive/20 text-destructive',
  },
  partial: {
    label: 'PARTIAL',
    className: 'bg-timeline-thinking/30 text-[#7a4229]',
  },
};

export function CrawlerAuditTable({ rows }: { rows: CrawlerAuditRow[] }) {
  return (
    <TooltipProvider delayDuration={200}>
      <div className="overflow-hidden rounded-xl border border-hairline bg-surface-card">
        <table className="w-full">
          <thead className="border-b border-hairline bg-canvas-soft">
            <tr>
              <th className="caption-uppercase px-4 py-3 text-left text-muted-strong">
                Bot
              </th>
              <th className="caption-uppercase px-4 py-3 text-left text-muted-strong">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const pill = STATUS_PILL[row.status];
              const pillClass = `caption-uppercase rounded-full px-2 py-0.5 text-[10px] ${pill.className}`;
              return (
                <tr
                  key={row.bot}
                  className="border-b border-hairline-soft last:border-0"
                >
                  <td className="px-4 py-3 font-mono text-[13px] text-ink">
                    {row.bot}
                  </td>
                  <td className="px-4 py-3">
                    {row.reason ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className={pillClass}>{pill.label}</span>
                        </TooltipTrigger>
                        <TooltipContent>{row.reason}</TooltipContent>
                      </Tooltip>
                    ) : (
                      <span className={pillClass}>{pill.label}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </TooltipProvider>
  );
}
