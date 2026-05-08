import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { GenerationDetailCard } from './generation-detail-card';
import type { Generation } from '@/db/schema';

const mk = (over: Partial<Generation> = {}): Generation => ({
  id: 1,
  siteId: 1,
  userId: 1,
  status: 'pending',
  trigger: 'manual',
  notifyEmail: false,
  notifiedAt: null,
  workflowRunId: null,
  resolvedSitemapUrl: null,
  llmsBlobPath: null,
  llmsFullBlobPath: null,
  errorMessage: null,
  startedAt: null,
  completedAt: null,
  createdAt: 't',
  updatedAt: 't',
  ...over,
});

describe('GenerationDetailCard', () => {
  it('disables download buttons until paths exist', () => {
    render(<GenerationDetailCard generation={mk({ status: 'running' })} onRetry={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole('button', { name: /download llms\.txt/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /download llms-full\.txt/i })).toBeDisabled();
  });

  it('enables downloads when paths populate', () => {
    render(
      <GenerationDetailCard
        generation={mk({ status: 'succeeded', llmsBlobPath: 'p1', llmsFullBlobPath: 'p2' })}
        onRetry={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole('link', { name: /download llms\.txt/i })).toBeInTheDocument();
  });

  it('shows error block on failed', () => {
    render(
      <GenerationDetailCard
        generation={mk({ status: 'failed', errorMessage: 'boom' })}
        onRetry={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText(/boom/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeEnabled();
  });
});
