import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { AddTaskButton } from '@/components/tasks/add-task-button';

export type EffectiveStatus = 'allowed' | 'blocked' | 'partial';

export type CrawlerAuditRow = {
  bot: string;
  status: EffectiveStatus;
  reason?: string;
};

const STATUS_PILL: Record<EffectiveStatus, { label: string; className: string }> = {
  allowed: {
    label: 'ALLOWED',
    className: 'bg-semantic-success/15 text-semantic-success',
  },
  blocked: {
    label: 'BLOCKED',
    className: 'bg-destructive/15 text-destructive',
  },
  partial: {
    label: 'PARTIAL',
    className: 'bg-surface-strong text-ink',
  },
};

export function CrawlerAuditTable({ rows, siteUid }: { rows: CrawlerAuditRow[]; siteUid: string }) {
  return (
    <TooltipProvider delayDuration={200}>
      <div className="overflow-hidden">
        <table className="w-full">
          <thead className="border-b border-hairline bg-canvas-soft">
            <tr>
              <th className="caption-uppercase px-4 py-3 text-left text-muted-strong">
                Bot
              </th>
              <th className="caption-uppercase px-4 py-3 text-right text-muted-strong">
                Status
              </th>
              <th aria-hidden="true" className="px-4 py-3" />
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
                  <td className="px-4 py-3 text-right">
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
                  <td className="px-4 py-3 text-right">
                    {row.status === 'blocked' && (
                      <AddTaskButton
                        siteUid={siteUid}
                        finding={{
                          sourceType: 'crawler-audit',
                          sourceId: row.bot,
                          title: `Allow ${row.bot} in robots.txt`,
                          foundText: row.reason ?? 'Blocked by robots.txt',
                          fixText: `Update robots.txt to allow ${row.bot}.`,
                        }}
                      />
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
