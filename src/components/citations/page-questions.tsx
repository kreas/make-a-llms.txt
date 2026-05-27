'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HelpCircle, RefreshCw, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface PageQuestionsProps {
  siteId: string;
  pageUrl: string;
}

export function PageQuestions({ siteId, pageUrl }: PageQuestionsProps) {
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ['page-questions', siteId, pageUrl],
    queryFn: async (): Promise<{ questions: string[] }> => {
      const res = await fetch(
        `/api/sites/${siteId}/questions?pageUrl=${encodeURIComponent(pageUrl)}`,
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error?.message || 'Failed to load questions');
      }
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const regenerate = useMutation({
    mutationFn: async (): Promise<{ questions: string[] }> => {
      const res = await fetch(`/api/sites/${siteId}/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageUrl }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error?.message || 'Failed to regenerate questions');
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['page-questions', siteId, pageUrl] });
    },
  });

  const questions = q.data?.questions || [];
  const isLoading = q.isLoading || regenerate.isPending;
  const isError = q.isError || regenerate.isError;
  const errorMsg =
    (q.error as Error | null)?.message ||
    (regenerate.error as Error | null)?.message ||
    'An error occurred.';

  return (
    <div className="flex flex-col gap-6 w-full">
      <div className="flex items-center justify-between gap-3 border-b border-hairline pb-4">
        <div>
          <h3 className="text-base font-semibold text-ink">Suggested Questions</h3>
          <p className="text-xs text-body mt-0.5">
            Key questions an AI or developer would ask about this page
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => regenerate.mutate()}
          disabled={isLoading}
          className="h-9 gap-1.5 border-hairline-strong text-ink hover:bg-canvas-soft transition-all duration-200"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', regenerate.isPending && 'animate-spin')} />
          <span>Regenerate</span>
        </Button>
      </div>

      {isLoading ? (
        <div className="rounded-xl bg-canvas-soft py-16 flex flex-col items-center justify-center gap-4 border border-hairline">
          <pre
            aria-hidden
            className="font-mono text-sm leading-tight text-ink animate-pulse"
          >{` /\\_/\\
( o.o )
 > ^ <`}</pre>
          <p className="text-sm text-body">Generating questions…</p>
        </div>
      ) : isError ? (
        <div className="border border-hairline rounded-xl p-4 bg-destructive/10 text-destructive text-sm flex gap-3 items-start">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Failed to load questions</p>
            <p className="text-xs mt-1 opacity-90">{errorMsg}</p>
          </div>
        </div>
      ) : questions.length === 0 ? (
        <div className="rounded-xl bg-canvas-soft py-16 flex flex-col items-center justify-center gap-2 border border-hairline text-center px-4">
          <HelpCircle className="h-8 w-8 text-muted-soft" />
          <p className="text-sm font-medium text-ink">No questions generated</p>
          <p className="text-xs text-body max-w-xs">
            Try clicking the regenerate button to analyze the page content and generate suggestions.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4 animate-fade-in">
          {questions.map((qText, index) => (
            <div
              key={index}
              className="flex items-start gap-4 p-4 rounded-xl border border-hairline bg-surface-card hover:border-hairline-strong hover:shadow-[0_4px_20px_rgba(0,0,0,0.02)] transition-all duration-300 group"
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-timeline-thinking/20 text-timeline-thinking border border-timeline-thinking/30 group-hover:bg-primary/10 group-hover:text-primary group-hover:border-primary/20 transition-colors duration-300">
                <HelpCircle className="h-4 w-4" />
              </div>
              <p className="text-sm font-medium text-ink leading-relaxed pt-0.5">
                {qText}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
