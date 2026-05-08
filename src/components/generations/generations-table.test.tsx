import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { GenerationsTable } from './generations-table';
import type { Generation } from '@/db/schema';

const mk = (over: Partial<Generation> = {}): Generation => ({
  id: 1,
  siteId: 1,
  userId: 1,
  status: 'succeeded',
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
  createdAt: '2026-05-07T00:00:00Z',
  updatedAt: '2026-05-07T00:00:00Z',
  ...over,
});

describe('GenerationsTable', () => {
  it('renders empty state', () => {
    render(<GenerationsTable generations={[]} />);
    expect(screen.getByText(/no generations yet/i)).toBeInTheDocument();
  });

  it('lists generations newest-first', () => {
    render(
      <GenerationsTable
        generations={[
          mk({ id: 1, createdAt: '2026-05-01T00:00:00Z' }),
          mk({ id: 2, createdAt: '2026-05-07T00:00:00Z' }),
        ]}
      />,
    );
    const items = screen.getAllByRole('row');
    expect(items[1]).toHaveTextContent('#2');
    expect(items[2]).toHaveTextContent('#1');
  });
});
