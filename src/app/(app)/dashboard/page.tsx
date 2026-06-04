import { requireUser } from '@/lib/auth-guards';
import { loadDashboardData } from '@/lib/services/dashboard';
import { StatCard } from '@/components/dashboard/stat-card';
import { ReadinessSparkline } from '@/components/dashboard/readiness-sparkline';
import { AuditUrlStrip } from '@/components/dashboard/audit-url-strip';
import { SitesTable } from '@/components/dashboard/sites-table';
import { AddSiteCard } from '@/components/sites/add-site-card';

export default async function DashboardPage() {
  const user = await requireUser();
  const data = await loadDashboardData(user.id);

  if (data.stats.sitesMonitored === 0) {
    return (
      <div className="flex flex-col gap-8">
        <header>
          <h1 className="display-lg text-ink">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-strong">AEO · AIO · GEO readiness across your sites</p>
        </header>
        <div className="grid grid-cols-1 gap-6 sm:max-w-sm">
          <AddSiteCard />
        </div>
      </div>
    );
  }

  const delta = data.stats.avgReadinessDelta;
  return (
    <div className="flex flex-col gap-7">
      <header>
        <h1 className="display-lg text-ink">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-strong">AEO · AIO · GEO readiness across your sites</p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Sites Monitored"
          value={String(data.stats.sitesMonitored)}
          meta={`${data.stats.auditedThisWeek} audited this week`}
        />
        <StatCard
          label="Avg. Readiness"
          value={data.stats.avgReadiness !== null ? String(data.stats.avgReadiness) : '—'}
          meta={
            delta !== null ? (
              <span>
                <span className={delta >= 0 ? 'font-semibold text-semantic-success' : 'font-semibold text-destructive'}>
                  {delta >= 0 ? `+${delta}` : delta}
                </span>{' '}
                recent trend
              </span>
            ) : (
              'No trend yet'
            )
          }
        >
          <ReadinessSparkline data={data.trend} />
        </StatCard>
        <StatCard label="Open Issues" value={String(data.stats.openIssues)} meta="across all sites" />
      </div>

      <AuditUrlStrip />

      <section>
        <h2 className="mb-3 text-xl font-normal tracking-tight text-ink">Monitored Websites</h2>
        <SitesTable rows={data.rows} />
      </section>
    </div>
  );
}
