import { KNOWN_AI_BOTS, type AuditBotStatus, type AuditResults } from '@/lib/known-ai-bots';

const STATUS_PILL: Record<AuditBotStatus, { label: string; className: string }> = {
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
  default: {
    label: 'DEFAULT',
    className: 'bg-timeline-read/30 text-[#2c405a]',
  },
};

function detailText(result: AuditResults[keyof AuditResults]): string {
  if (result.status === 'partial' && result.disallowedPaths?.length) {
    return result.disallowedPaths.join(', ');
  }
  if (result.status === 'default') return 'Falls under * rules';
  return '';
}

export function CrawlerAuditTable({ results }: { results: AuditResults }) {
  return (
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
            <th className="caption-uppercase px-4 py-3 text-left text-muted-strong">
              Detail
            </th>
          </tr>
        </thead>
        <tbody>
          {KNOWN_AI_BOTS.map((bot) => {
            const r = results[bot];
            const pill = STATUS_PILL[r.status];
            return (
              <tr key={bot} className="border-b border-hairline-soft last:border-0">
                <td className="px-4 py-3 font-mono text-[13px] text-ink">{bot}</td>
                <td className="px-4 py-3">
                  <span
                    className={`caption-uppercase rounded-full px-2 py-0.5 text-[10px] ${pill.className}`}
                  >
                    {pill.label}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-[12px] text-muted-strong">
                  {detailText(r)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
