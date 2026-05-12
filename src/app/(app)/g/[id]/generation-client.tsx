'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import type { Generation } from '@/db/schema';
import { GenerationDetailCard } from '@/components/generations/generation-detail-card';
import { PagesSection } from '@/components/generations/pages-section';

export function GenerationClient({ initial }: { initial: Generation }) {
  const router = useRouter();
  const [generation, setGeneration] = useState<Generation>(initial);

  useEffect(() => {
    if (['succeeded', 'failed', 'cancelled'].includes(initial.status)) return;
    const es = new EventSource(`/api/generations/${initial.id}/stream`);
    es.addEventListener('status', (e) => {
      const next = JSON.parse((e as MessageEvent).data);
      setGeneration((prev) => ({ ...prev, ...next }));
    });
    es.onerror = () => es.close();
    return () => es.close();
  }, [initial.id, initial.status]);

  const cancel = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/generations/${generation.id}/cancel`, { method: 'POST' });
      if (!res.ok) throw new Error('Cancel failed');
      return res.json() as Promise<{ generation: Generation }>;
    },
    onSuccess: ({ generation: g }) => setGeneration(g),
  });

  const retry = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/generations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ siteId: generation.siteId }),
      });
      if (!res.ok) throw new Error('Retry failed');
      return res.json() as Promise<{ generation: { id: number } }>;
    },
    onSuccess: ({ generation: g }) => router.push(`/g/${g.id}`),
  });

  return (
    <div className="flex flex-col gap-6">
      <GenerationDetailCard
        generation={generation}
        onRetry={() => retry.mutate()}
        onCancel={() => cancel.mutate()}
      />
      <PagesSection generation={generation} />
    </div>
  );
}
