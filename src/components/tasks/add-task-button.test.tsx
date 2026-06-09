import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AddTaskButton } from './add-task-button';

const mutate = vi.fn();
let tasksData: { tasks: unknown[] } | undefined = { tasks: [] };

vi.mock('@/hooks/use-site-tasks', () => ({
  useSiteTasks: () => ({ data: tasksData, isLoading: false }),
  useCreateSiteTask: () => ({ mutate, isPending: false }),
}));

const FINDING = {
  sourceType: 'citation-check' as const,
  sourceId: 'schema-type',
  pageUrl: 'https://x.com/about',
  title: 'Schema.org type',
  foundText: 'Unrecognized @type(s): JobPosting',
  fixText: 'Declare a Schema.org @type appropriate for this page.',
};

const existing = (status: string) => ({
  id: 't1', sourceType: 'citation-check', sourceId: 'schema-type',
  pageUrl: 'https://x.com/about', title: 'Schema.org type',
  foundText: '', fixText: '', status,
  createdAt: '', statusChangedAt: '',
});

beforeEach(() => {
  mutate.mockClear();
  tasksData = { tasks: [] };
});

describe('AddTaskButton', () => {
  it('creates a task on click when none exists', () => {
    render(<AddTaskButton siteUid="s1" finding={FINDING} />);
    fireEvent.click(screen.getByRole('button', { name: /add task/i }));
    expect(mutate).toHaveBeenCalledWith(FINDING);
  });

  it('shows Added for an open task', () => {
    tasksData = { tasks: [existing('open')] };
    render(<AddTaskButton siteUid="s1" finding={FINDING} />);
    expect(screen.getByText('Added')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows Done for done and verified tasks', () => {
    tasksData = { tasks: [existing('verified')] };
    const { unmount } = render(<AddTaskButton siteUid="s1" finding={FINDING} />);
    expect(screen.getByText('Done')).toBeInTheDocument();
    unmount();
    tasksData = { tasks: [existing('done')] };
    render(<AddTaskButton siteUid="s1" finding={FINDING} />);
    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  it("shows Won't do for wont_do tasks", () => {
    tasksData = { tasks: [existing('wont_do')] };
    render(<AddTaskButton siteUid="s1" finding={FINDING} />);
    expect(screen.getByText("Won't do")).toBeInTheDocument();
  });

  it('does not match a task for a different page', () => {
    tasksData = { tasks: [{ ...existing('open'), pageUrl: 'https://x.com/other' }] };
    render(<AddTaskButton siteUid="s1" finding={FINDING} />);
    expect(screen.getByRole('button', { name: /add task/i })).toBeInTheDocument();
  });
});
