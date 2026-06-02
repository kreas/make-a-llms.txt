'use client';

import { useState } from 'react';
import { FileText, Copy, Download, Check, Sparkles } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Generation } from '@/db/schema';
import { TabPanel } from '@/components/layout/tab-panel';

export function LlmsContentPanel({
  generation,
  siteId: _siteId,
}: {
  generation: Generation | null;
  siteId: string;
}) {
  const [copied, setCopied] = useState(false);
  const queryClient = useQueryClient();

  const contentQuery = useQuery({
    queryKey: ['llmsContent', generation?.uid],
    enabled: !!generation?.llmsBlobPath,
    queryFn: async () => {
      const res = await fetch(`/api/generations/${generation!.uid}/files/llms`);
      if (!res.ok) throw new Error('Failed to load content');
      return res.text();
    },
    staleTime: 5 * 60 * 1000,
  });

  const rewrite = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/generations/${generation!.uid}/rewrite`, {
        method: 'POST',
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({})) as { error?: { message?: string }; message?: string };
        throw new Error(errJson.error?.message ?? errJson.message ?? 'Failed to rewrite llms.txt');
      }
      const data = await res.json() as { content: string };
      return data.content;
    },
    onSuccess: (newContent) => {
      queryClient.setQueryData(['llmsContent', generation?.uid], newContent);
    },
  });

  const content = contentQuery.data ?? null;
  const error = contentQuery.error?.message ?? rewrite.error?.message ?? null;

  async function handleCopy() {
    if (!content) return;
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (!generation) {
    return (
      <div className="flex h-[600px] flex-col items-center justify-center p-8 text-center">
        <FileText className="h-8 w-8 text-muted-soft" />
        <p className="mt-4 text-base text-muted-strong">
          No successful generation yet. Click{' '}
          <span className="text-ink">Re-run Generation</span> to start one.
        </p>
      </div>
    );
  }

  return (
    <TabPanel
      flat
      meta={
        <span className="flex items-center gap-2 font-mono text-[13px] font-medium text-ink">
          <FileText className="h-4 w-4 text-muted-soft" />
          llms.txt
        </span>
      }
      actions={
        <>
          <button
            type="button"
            onClick={() => rewrite.mutate()}
            disabled={rewrite.isPending || !content}
            className="inline-flex items-center gap-1.5 rounded border border-hairline-strong bg-surface-card px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-canvas-soft disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {rewrite.isPending ? 'Rewriting…' : 'Smart Format'}
          </button>
          <button
            type="button"
            onClick={handleCopy}
            disabled={!content}
            className="inline-flex items-center gap-1.5 rounded border border-hairline-strong bg-surface-card px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-canvas-soft disabled:opacity-50"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <a
            href={`/api/generations/${generation.uid}/files/llms`}
            className="inline-flex items-center gap-1.5 rounded border border-hairline-strong bg-surface-card px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-canvas-soft"
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </a>
        </>
      }
      contentClassName="p-0 overflow-hidden"
    >
      <div className="p-4">
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : content ? (
          <pre className="whitespace-pre-wrap font-mono text-[13px] leading-relaxed text-body">
            {content}
          </pre>
        ) : (
          <p className="font-mono text-[13px] text-muted-soft">Loading…</p>
        )}
      </div>
    </TabPanel>
  );
}
