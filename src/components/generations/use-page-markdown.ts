'use client';
import { useQuery } from '@tanstack/react-query';

export function usePageMarkdown(generationUid: string | undefined, path: string | null) {
  return useQuery({
    queryKey: ['pageMd', generationUid, path],
    enabled: !!generationUid && !!path,
    queryFn: async () => {
      const res = await fetch(`/api/generations/${generationUid}/pages/${path}?t=${Date.now()}`);
      if (!res.ok) throw new Error(`status ${res.status}`);
      return res.text();
    },
    staleTime: 5 * 60 * 1000,
  });
}
