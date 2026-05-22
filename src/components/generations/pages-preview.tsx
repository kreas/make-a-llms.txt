'use client';

import { useState } from 'react';
import { FileText, Copy, Download, Check } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';

export function PagesPreview({
  generationId,
  selectedPath,
}: {
  generationId: string;
  selectedPath: string | null;
}) {
  const [copied, setCopied] = useState(false);

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
      <div className="flex min-h-[400px] flex-col items-center justify-center p-8 text-center">
        <FileText className="h-8 w-8 text-muted-soft" />
        <p className="mt-4 text-base text-muted-strong">
          Select a page on the left to preview.
        </p>
      </div>
    );
  }

  const filename = `${selectedPath}.md`;
  const downloadHref = `/api/generations/${generationId}/pages/${selectedPath}`;
  const content = q.data ?? null;

  async function handleCopy() {
    if (!content) return;
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between border-b border-hairline pb-3">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-soft" />
          <span className="font-mono text-[13px] font-medium text-ink">{filename}</span>
        </div>
        <div className="flex gap-2">
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
            href={downloadHref}
            className="inline-flex items-center gap-1.5 rounded border border-hairline-strong bg-surface-card px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-canvas-soft"
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </a>
        </div>
      </div>
      <div
        className={cn(
          'pt-4',
          !content && 'flex min-h-[200px] items-center justify-center',
        )}
      >
        {q.isError ? (
          <p className="text-sm text-destructive">Couldn&apos;t load this page.</p>
        ) : content ? (
          <pre className="whitespace-pre-wrap font-mono text-[13px] leading-relaxed text-body">
            {content}
          </pre>
        ) : (
          <p className="font-mono text-[13px] text-muted-soft">Loading…</p>
        )}
      </div>
    </div>
  );
}
