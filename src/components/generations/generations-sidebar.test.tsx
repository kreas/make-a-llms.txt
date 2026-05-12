import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GenerationsSidebar } from './generations-sidebar';
import type { Generation } from '@/db/schema';

function gen(overrides: Partial<Generation>): Generation {
  return {
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
    createdAt: '2026-05-12T10:00:00Z',
    updatedAt: '2026-05-12T10:00:00Z',
    pagesManifestBlobPath: null,
    pagesCount: 0,
    pagesStatus: 'succeeded',
    pagesErrorMessage: null,
    ...overrides,
  } as Generation;
}

describe('GenerationsSidebar', () => {
  it('renders empty state when no generations', () => {
    render(
      <GenerationsSidebar
        generations={[]}
        selectedId={null}
        onSelect={() => {}}
        collapsed={false}
        onToggleCollapse={() => {}}
      />,
    );
    expect(screen.getByText(/no generations yet/i)).toBeInTheDocument();
  });

  it('lists generations sorted newest first', () => {
    const older = gen({ id: 1, createdAt: '2026-05-10T10:00:00Z' });
    const newer = gen({ id: 2, createdAt: '2026-05-12T10:00:00Z' });
    render(
      <GenerationsSidebar
        generations={[older, newer]}
        selectedId={null}
        onSelect={() => {}}
        collapsed={false}
        onToggleCollapse={() => {}}
      />,
    );
    const rows = screen.getAllByRole('button', { pressed: false });
    // The "Hide runs" toggle button is also a button but has no aria-pressed,
    // so the pressed:false filter narrows to the generation rows.
    expect(rows[0]).toHaveTextContent('#2');
    expect(rows[1]).toHaveTextContent('#1');
  });

  it('marks the selected row with aria-pressed', () => {
    const g1 = gen({ id: 1 });
    const g2 = gen({ id: 2 });
    render(
      <GenerationsSidebar
        generations={[g1, g2]}
        selectedId={2}
        onSelect={() => {}}
        collapsed={false}
        onToggleCollapse={() => {}}
      />,
    );
    const selected = screen.getByRole('button', { pressed: true });
    expect(selected).toHaveTextContent('#2');
  });

  it('fires onSelect when a row is clicked', () => {
    const onSelect = vi.fn();
    const g1 = gen({ id: 1 });
    const g2 = gen({ id: 2 });
    render(
      <GenerationsSidebar
        generations={[g1, g2]}
        selectedId={null}
        onSelect={onSelect}
        collapsed={false}
        onToggleCollapse={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /#1/ }));
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it('fires onToggleCollapse when the hide button is clicked', () => {
    const onToggleCollapse = vi.fn();
    render(
      <GenerationsSidebar
        generations={[gen({ id: 1 })]}
        selectedId={null}
        onSelect={() => {}}
        collapsed={false}
        onToggleCollapse={onToggleCollapse}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /hide runs/i }));
    expect(onToggleCollapse).toHaveBeenCalled();
  });

  it('renders just a rail with an expand button when collapsed', () => {
    const onToggleCollapse = vi.fn();
    render(
      <GenerationsSidebar
        generations={[gen({ id: 1 })]}
        selectedId={null}
        onSelect={() => {}}
        collapsed
        onToggleCollapse={onToggleCollapse}
      />,
    );
    // Header label and rows are hidden.
    expect(screen.queryByText(/generations/i)).not.toBeInTheDocument();
    expect(screen.queryByText('#1')).not.toBeInTheDocument();
    // Expand button is still there.
    fireEvent.click(screen.getByRole('button', { name: /show runs/i }));
    expect(onToggleCollapse).toHaveBeenCalled();
  });
});
