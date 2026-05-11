import { requireUser } from '@/lib/auth-guards';

export default async function DocumentationPage() {
  await requireUser();
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <header>
        <h1 className="display-lg text-ink">Documentation</h1>
        <p className="mt-2 text-base text-muted-strong">
          How to use llms.txt Generator and what the output looks like.
        </p>
      </header>
      <section className="rounded-lg border border-hairline bg-surface-card p-8">
        <h2 className="text-lg font-semibold text-ink">What is llms.txt?</h2>
        <p className="mt-3 text-base text-body">
          <code className="font-mono">llms.txt</code> is a proposed standard for helping large
          language models find and understand canonical information about a site. It lives at the
          root of your domain, similar to{' '}
          <code className="font-mono">robots.txt</code> or{' '}
          <code className="font-mono">sitemap.xml</code>, and lists your most important pages with
          one-line summaries.
        </p>
      </section>
      <section className="rounded-lg border border-hairline bg-surface-card p-8">
        <h2 className="text-lg font-semibold text-ink">Generating files</h2>
        <ol className="mt-3 flex flex-col gap-2 text-base text-body">
          <li>1. Add a project from the dashboard with your site&apos;s URL.</li>
          <li>2. We auto-discover your sitemap or fall back to parsing your robots.txt.</li>
          <li>
            3. The generator produces <code className="font-mono">llms.txt</code> and{' '}
            <code className="font-mono">llms-full.txt</code>, which you can download or host.
          </li>
        </ol>
      </section>
      <section className="rounded-lg border border-hairline bg-surface-card p-8">
        <h2 className="text-lg font-semibold text-ink">Webhook</h2>
        <p className="mt-3 text-base text-body">
          Each project has a unique webhook URL. POST to it with the bearer token from the project
          page to trigger a regeneration — useful for re-running after a content deploy.
        </p>
      </section>
    </div>
  );
}
