'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import type { Generation } from '@/db/schema';
import { GenerationDetailCard } from '@/components/generations/generation-detail-card';

export function GenerationClient({ initial, siteUid }: { initial: Generation; siteUid: string }) {
  const router = useRouter();
  const [generation, setGeneration] = useState<Generation>(initial);

  useEffect(() => {
    if (['succeeded', 'failed', 'cancelled'].includes(initial.status)) return;
    const es = new EventSource(`/api/generations/${initial.uid}/stream`);
    es.addEventListener('status', (e) => {
      const next = JSON.parse((e as MessageEvent).data);
      setGeneration((prev) => ({ ...prev, ...next }));
    });
    es.onerror = () => es.close();
    return () => es.close();
  }, [initial.uid, initial.status]);

  const cancel = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/generations/${generation.uid}/cancel`, { method: 'POST' });
      if (!res.ok) throw new Error('Cancel failed');
      return res.json() as Promise<{ generation: Generation }>;
    },
    onSuccess: ({ generation: g }) => setGeneration(g),
  });

  const retry = useMutation({
    mutationFn: async () => {
      // siteId in POST body must be the site's uid (UUID string)
      const res = await fetch('/api/generations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ siteId: siteUid, notifyEmail: false }),
      });
      if (!res.ok) throw new Error('Retry failed');
      return res.json() as Promise<{ generation: { uid: string } }>;
    },
    onSuccess: ({ generation: g }) => router.push(`/g/${g.uid}`),
  });

  return (
    <GenerationDetailCard
      generation={generation}
      onRetry={() => retry.mutate()}
      onCancel={() => cancel.mutate()}
    />
  );
}
