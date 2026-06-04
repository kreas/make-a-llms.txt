import type { DashboardSiteRow } from '@/lib/services/dashboard';
import { SitesTableRow } from './sites-table-row';

const TH = 'px-3 pb-3 text-left text-[10.5px] font-semibold uppercase tracking-wider text-muted-strong';

export function SitesTable({ rows }: { rows: DashboardSiteRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-hairline">
            <th className={TH}>Website</th>
            <th className={TH}>Score</th>
            <th className={TH}>Readable</th>
            <th className={TH}>Recommendable</th>
            <th className={TH}>Recognized</th>
            <th className={`${TH} text-right`}>Issues</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <SitesTableRow key={row.site.id} row={row} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
