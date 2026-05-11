'use client';

import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { Info } from 'lucide-react';
import { SiteForm, type SiteFormValues } from '@/components/sites/site-form';

export default function NewSitePage() {
  const router = useRouter();
  const mutation = useMutation({
    mutationFn: async (v: SiteFormValues) => {
      // Derive a default name from the host. The server will accept either
      // an explicit name or attempt page-title fetch in a follow-up pass;
      // for now we send the host so the API's validators are satisfied.
      const host = new URL(v.rootUrl).host.replace(/^www\./, '');
      const res = await fetch('/api/sites', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: host, rootUrl: v.rootUrl, sitemapUrl: v.sitemapUrl }),
      });
      if (!res.ok) throw new Error((await res.json()).error?.message ?? 'Failed');
      const data = (await res.json()) as { site: { id: number }; webhookToken: string };
      // Kick off the first generation immediately
      await fetch('/api/generations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ siteId: data.site.id, notifyEmail: false }),
      });
      sessionStorage.setItem(`fresh-token-${data.site.id}`, data.webhookToken);
      return data;
    },
    onSuccess: ({ site }) => router.push(`/sites/${site.id}`),
  });

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-8">
      <header className="text-center">
        <h1 className="display-lg text-ink">Add New Site</h1>
        <p className="mt-2 text-base text-muted-strong">
          Provide the origin URL to begin generating your developer documentation index.
        </p>
      </header>
      <div className="rounded-lg border border-hairline bg-surface-card p-8">
        <SiteForm onSubmit={(v) => mutation.mutate(v)} />
        {mutation.error && (
          <p className="mt-4 text-sm text-destructive">{(mutation.error as Error).message}</p>
        )}
      </div>
      <div className="flex items-start gap-3 rounded-md bg-canvas-soft p-4 text-sm text-muted-strong">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <p>
          We will crawl your site to generate an optimized{' '}
          <code className="font-mono">llms.txt</code> and{' '}
          <code className="font-mono">llms-full.txt</code> file. This process may take a few minutes
          depending on the site&apos;s size.
        </p>
      </div>
    </div>
  );
}
