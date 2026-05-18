'use client';

import Link from 'next/link';
import type { Generation } from '@/db/schema';
import { Button } from '@/components/ui/button';
import { StatusBadge } from './status-badge';

export function GenerationDetailCard({
  generation,
  onRetry,
  onCancel,
}: {
  generation: Generation;
  onRetry: () => void;
  onCancel: () => void;
}) {
  const isTerminal = ['succeeded', 'failed', 'cancelled'].includes(generation.status);
  const llmsHref = generation.llmsBlobPath
    ? `/api/generations/${generation.uid}/files/llms`
    : null;
  const llmsFullHref = generation.llmsFullBlobPath
    ? `/api/generations/${generation.uid}/files/llms-full`
    : null;

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-hairline bg-surface-card p-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="display-sm text-ink">Generation #{generation.id}</div>
          <div className="mt-1 text-sm text-body">
            Trigger: {generation.trigger}
          </div>
        </div>
        <StatusBadge status={generation.status} />
      </div>

      {generation.errorMessage && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {generation.errorMessage}
        </div>
      )}

      <div className="flex gap-2">
        {llmsHref ? (
          <Link
            href={llmsHref}
            className="inline-flex h-10 items-center rounded-md bg-ink px-4 text-sm text-canvas"
          >
            Download llms.txt
          </Link>
        ) : (
          <Button disabled>Download llms.txt</Button>
        )}
        {llmsFullHref ? (
          <Link
            href={llmsFullHref}
            className="inline-flex h-10 items-center rounded-md border border-hairline-strong bg-surface-card px-4 text-sm text-ink"
          >
            Download llms-full.txt
          </Link>
        ) : (
          <Button disabled variant="outline">
            Download llms-full.txt
          </Button>
        )}
      </div>

      <div className="flex gap-2">
        {!isTerminal && (
          <Button onClick={onCancel} variant="outline">
            Cancel
          </Button>
        )}
        {(generation.status === 'failed' || generation.status === 'cancelled') && (
          <Button onClick={onRetry}>Retry</Button>
        )}
      </div>
    </div>
  );
}
