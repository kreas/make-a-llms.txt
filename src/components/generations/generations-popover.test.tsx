import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import type { Generation } from '@/db/schema';
import { GenerationsPopover } from './generations-popover';

function mkGen(overrides: Partial<Generation>): Generation {
  return {
    id: 1,
    uid: 'uid-1',
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
    pagesManifestBlobPath: null,
    pagesCount: 0,
    pagesStatus: 'succeeded',
    pagesErrorMessage: null,
    summariesStatus: 'succeeded',
    summariesCount: 0,
    summariesEmptyCount: 0,
    summariesFailedCount: 0,
    summariesManifestBlobPath: null,
    summariesErrorMessage: null,
    startedAt: null,
    completedAt: null,
    createdAt: '2026-05-20T00:00:00Z',
    updatedAt: '2026-05-20T00:00:00Z',
    ...overrides,
  } as Generation;
}

describe('GenerationsPopover', () => {
  it('renders the current generation id on the trigger', () => {
    const g = mkGen({ id: 10 });
    render(<GenerationsPopover generations={[g]} selectedId={10} onSelect={() => {}} />);
    expect(screen.getByRole('button', { name: /switch generation/i })).toHaveTextContent('#10');
  });

  it('shows "No runs" when there are no generations', () => {
    render(<GenerationsPopover generations={[]} selectedId={null} onSelect={() => {}} />);
    expect(screen.getByRole('button', { name: /switch generation/i })).toHaveTextContent(
      'No runs',
    );
  });

  it('opens a list of generations and calls onSelect when an item is clicked', async () => {
    const onSelect = vi.fn();
    const gens = [
      mkGen({ id: 10, uid: 'a', createdAt: '2026-05-20T00:00:00Z' }),
      mkGen({ id: 9, uid: 'b', createdAt: '2026-05-19T00:00:00Z' }),
    ];
    render(<GenerationsPopover generations={gens} selectedId={10} onSelect={onSelect} />);

    await userEvent.click(screen.getByRole('button', { name: /switch generation/i }));
    const olderRow = await screen.findByRole('button', { name: /#9/ });
    await userEvent.click(olderRow);
    expect(onSelect).toHaveBeenCalledWith(9);
  });
});
