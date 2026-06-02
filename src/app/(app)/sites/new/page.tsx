'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { SiteForm, type SiteFormValues } from '@/components/sites/site-form';
import { Confetti } from '@/components/ui/confetti';

export default function NewSitePage() {
  const router = useRouter();
  const [showConfetti, setShowConfetti] = useState(false);
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
      const data = (await res.json()) as { site: { id: string }; webhookToken: string };
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
    <div className="w-full pb-36 md:pb-48">
      {/* Confetti effect when the preflight check passes */}
      {showConfetti && (
        <Confetti
          stopping={mutation.isPending}
          onComplete={() => setShowConfetti(false)}
        />
      )}

      {/* Background color of this page */}
      <div className="fixed inset-0 bg-[#ebe0c3] -z-20 pointer-events-none" />

      {/* Page Content */}
      <div className="mx-auto flex max-w-xl flex-col gap-8 relative z-10">
        <header className="text-center">
          <h1 className="display-lg text-ink">Start a New Project</h1>
        </header>
        <div className="rounded-lg border border-hairline bg-surface-card p-8 shadow-sm">
          <SiteForm
            onSubmit={(v) => mutation.mutate(v)}
            onPreflightSuccess={() => setShowConfetti(true)}
          />
          {mutation.error && (
            <p className="mt-4 text-sm text-destructive">{(mutation.error as Error).message}</p>
          )}
        </div>
      </div>

      {/* Full-width illustration background image at the bottom, flush with the footer */}
      <div
        className="absolute bottom-0 left-1/2 w-screen -translate-x-1/2 aspect-[1024/438] bg-[url('/new-site-cats.png')] bg-bottom bg-no-repeat bg-cover pointer-events-none -z-10"
      />
    </div>
  );
}
