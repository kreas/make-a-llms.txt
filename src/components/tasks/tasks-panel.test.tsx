import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TasksPanel } from './tasks-panel';

const updateMutate = vi.fn();
let tasksData: { tasks: unknown[] } | undefined;
let isLoading = false;

vi.mock('next/navigation', () => ({ usePathname: () => '/sites/uid-1' }));
vi.mock('@/hooks/use-site-tasks', () => ({
  useSiteTasks: () => ({ data: tasksData, isLoading }),
  useUpdateSiteTaskStatus: () => ({ mutate: updateMutate, isPending: false }),
}));
vi.mock('@/components/generations/page-workspace-context', () => ({
  usePageWorkspace: () => ({
    pages: [{ url: 'https://x.com/about', path: 'about', filename: 'about', status: 'ok' }],
  }),
}));

const task = (over: Record<string, unknown> = {}) => ({
  id: 't1', sourceType: 'citation-check', sourceId: 'schema-type',
  pageUrl: 'https://x.com/about', title: 'Schema.org type',
  foundText: 'Unrecognized @type(s): JobPosting',
  fixText: 'Declare a Schema.org @type appropriate for this page.',
  status: 'open', createdAt: '2026-06-09T00:00:00Z', statusChangedAt: '2026-06-09T00:00:00Z',
  ...over,
});

beforeEach(() => {
  updateMutate.mockClear();
  tasksData = { tasks: [] };
  isLoading = false;
});

describe('TasksPanel', () => {
  it('shows the empty state when there are no tasks', () => {
    render(<TasksPanel siteUid="s1" />);
    expect(screen.getByText(/no tasks yet/i)).toBeInTheDocument();
  });

  it('groups tasks by status', () => {
    tasksData = {
      tasks: [
        task(),
        task({ id: 't2', sourceId: 'h1-present', status: 'verified', title: 'H1 present' }),
        task({ id: 't3', sourceId: 'canonical', status: 'wont_do', title: 'Canonical tag' }),
      ],
    };
    render(<TasksPanel siteUid="s1" />);
    expect(screen.getByRole('heading', { name: 'Open' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Completed' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /won't do/i })).toBeInTheDocument();
    expect(screen.getByText('Verified by audit')).toBeInTheDocument();
  });

  it('marks an open task done via the checkbox', () => {
    tasksData = { tasks: [task()] };
    render(<TasksPanel siteUid="s1" />);
    fireEvent.click(screen.getByRole('button', { name: /mark done/i }));
    expect(updateMutate).toHaveBeenCalledWith({ taskId: 't1', status: 'done' });
  });

  it("flags an open task as won't do", () => {
    tasksData = { tasks: [task()] };
    render(<TasksPanel siteUid="s1" />);
    fireEvent.click(screen.getByRole('button', { name: /won't do/i }));
    expect(updateMutate).toHaveBeenCalledWith({ taskId: 't1', status: 'wont_do' });
  });

  it('reopens a non-open task', () => {
    tasksData = { tasks: [task({ status: 'wont_do' })] };
    render(<TasksPanel siteUid="s1" />);
    fireEvent.click(screen.getByRole('button', { name: /reopen/i }));
    expect(updateMutate).toHaveBeenCalledWith({ taskId: 't1', status: 'open' });
  });

  it('deep-links citation tasks to the readable tab for their page', () => {
    tasksData = { tasks: [task()] };
    render(<TasksPanel siteUid="s1" />);
    const link = screen.getByRole('link', { name: /view source/i });
    expect(link).toHaveAttribute('href', '/sites/uid-1?tab=readable&page=about');
  });
});
