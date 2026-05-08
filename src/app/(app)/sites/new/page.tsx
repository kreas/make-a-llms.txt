'use client';

import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { SiteForm, type SiteFormValues } from '@/components/sites/site-form';

export default function NewSitePage() {
  const router = useRouter();
  const mutation = useMutation({
    mutationFn: async (v: SiteFormValues) => {
      const res = await fetch('/api/sites', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(v),
      });
      if (!res.ok) throw new Error((await res.json()).error?.message ?? 'Failed');
      return res.json() as Promise<{ site: { id: number }; webhookToken: string }>;
    },
    onSuccess: ({ site, webhookToken }) => {
      sessionStorage.setItem(`fresh-token-${site.id}`, webhookToken);
      router.push(`/sites/${site.id}`);
    },
  });

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="display-lg mb-6 text-ink">New site</h1>
      <SiteForm onSubmit={(v) => mutation.mutate(v)} />
      {mutation.error && (
        <p className="mt-4 text-sm text-destructive">{(mutation.error as Error).message}</p>
      )}
    </div>
  );
}
