'use client';

import { useQuery } from '@tanstack/react-query';

export function PagesPreview({
  generationId,
  selectedPath,
}: {
  generationId: number;
  selectedPath: string | null;
}) {
  const q = useQuery({
    queryKey: ['pageMd', generationId, selectedPath],
    enabled: !!selectedPath,
    queryFn: async () => {
      const res = await fetch(`/api/generations/${generationId}/pages/${selectedPath}`);
      if (!res.ok) throw new Error(`status ${res.status}`);
      return res.text();
    },
    staleTime: 5 * 60 * 1000,
  });

  if (!selectedPath) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-body">
        Select a page on the left to preview.
      </div>
    );
  }
  if (q.isPending) {
    return <div className="p-6 text-body">Loading…</div>;
  }
  if (q.isError) {
    return <div className="p-6 text-body">Couldn&apos;t load this page.</div>;
  }

  return (
    <pre className="h-full overflow-auto whitespace-pre-wrap break-words p-6 font-mono text-sm text-body">
      {q.data}
    </pre>
  );
}
