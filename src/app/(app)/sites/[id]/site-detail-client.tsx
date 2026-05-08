'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import type { Site, Generation } from '@/db/schema';
import { WebhookBlock } from '@/components/sites/webhook-block';
import { GenerationsTable } from '@/components/generations/generations-table';
import { RegenerateButton } from '@/components/generations/regenerate-button';

export function SiteDetailClient({
  site,
  initialGenerations,
}: {
  site: Site;
  initialGenerations: Generation[];
}) {
  const router = useRouter();
  const [freshToken, setFreshToken] = useState<string | null>(null);

  useEffect(() => {
    const key = `fresh-token-${site.id}`;
    const t = sessionStorage.getItem(key);
    if (t) {
      setFreshToken(t);
      sessionStorage.removeItem(key);
    }
  }, [site.id]);

  const rotate = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/sites/${site.id}/rotate-token`, { method: 'POST' });
      if (!res.ok) throw new Error('Rotate failed');
      return res.json() as Promise<{ webhookToken: string }>;
    },
    onSuccess: ({ webhookToken }) => setFreshToken(webhookToken),
  });

  const regen = useMutation({
    mutationFn: async (v: { siteId: number; notifyEmail: boolean }) => {
      const res = await fetch('/api/generations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(v),
      });
      if (!res.ok) throw new Error('Regenerate failed');
      return res.json() as Promise<{ generation: { id: number } }>;
    },
    onSuccess: ({ generation }) => router.push(`/g/${generation.id}`),
  });

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="display-lg text-ink">{site.name}</h1>
          <p className="text-body">{site.rootUrl}</p>
        </div>
        <RegenerateButton siteId={site.id} onSubmit={(v) => regen.mutate(v)} />
      </div>

      <WebhookBlock
        siteId={site.id}
        tokenPrefix={site.webhookTokenPrefix}
        freshToken={freshToken ?? undefined}
        onRotate={() => rotate.mutate()}
      />

      <section>
        <h2 className="display-md mb-4 text-ink">Recent generations</h2>
        <GenerationsTable generations={initialGenerations} />
      </section>
    </div>
  );
}
