import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OverviewPanel } from './overview-panel';

// ---- module mocks ----
vi.mock('next/navigation', () => ({ usePathname: () => '/sites/uid-1' }));

let mockTasksData: { tasks: unknown[] } | undefined = { tasks: [] };
vi.mock('@/hooks/use-site-tasks', () => ({
  useSiteTasks: () => ({ data: mockTasksData, isLoading: false, isPending: false }),
}));

vi.mock('./page-workspace-context', () => ({
  usePageWorkspace: () => ({ pages: [{ url: 'https://x.com/about', path: 'about' }] }),
}));

vi.mock('@/components/tasks/tasks-panel', async (importOriginal) => {
  // keep the real taskSourceHref export, stub the panel
  const mod = await importOriginal<typeof import('@/components/tasks/tasks-panel')>();
  return { ...mod, TasksPanel: () => <div data-testid="tasks-panel" /> };
});

vi.mock('@/components/tasks/add-task-button', () => ({
  AddTaskButton: ({ finding }: { finding: { sourceId: string } }) => (
    <div data-testid={`add-task-${finding.sourceId}`} />
  ),
}));

// ---- helpers ----
function renderWithLatest(audits: unknown[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ audits }), { status: 200 })));
  const onNavigate = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <OverviewPanel siteId="s1" onNavigate={onNavigate} />
    </QueryClientProvider>,
  );
  return { onNavigate };
}

const mkAudit = (pageUrl: string, checks: unknown[]) => ({ pageUrl, status: 'succeeded', score: 50, tier: 'fair', results: { checks } });

const fetchMock = vi.fn();
beforeEach(() => {
  mockTasksData = { tasks: [] };
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

// ---- original tests ----
describe('OverviewPanel', () => {
  it('shows the three pillar cards', async () => {
    renderWithLatest([mkAudit('https://x.com/', [{ id: 'answer-position', passed: true, score: 100, weight: 15, evidence: [], recommendation: null }])]);
    // Use role query for pillar card buttons to avoid matching the status sentence which also contains "Readable"
    expect(await screen.findByRole('button', { name: /readable/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /recognized/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /recommendable/i })).toBeInTheDocument();
  });

  it('surfaces the highest-weight failing check as Do this next and navigates on click', async () => {
    const { onNavigate } = renderWithLatest([
      mkAudit('https://x.com/', [{ id: 'schema-type', passed: false, score: 0, weight: 10, evidence: [], recommendation: 'Add schema' }]),
    ]);
    expect(await screen.findByText(/do this next/i)).toBeInTheDocument();
    expect(screen.getByText('Add schema')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /show me how/i }));
    expect(onNavigate).toHaveBeenCalledWith('recognized');
  });
});

describe('OverviewPanel GEO card', () => {
  it('renders the live Recommendable score from the GEO audit', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('citation-audits/latest')) {
        return Promise.resolve({ ok: true, json: async () => ({ audits: [] }) });
      }
      if (url.includes('geo-audit/latest')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ audit: { status: 'succeeded', score: 70, tier: 'good', results: { score: 70, tier: 'good', signals: [], metadata: { pagesScanned: 1, candidates: 0, confirmCalls: 0 } } } }),
        });
      }
      if (url.includes('/tasks')) {
        return Promise.resolve({ ok: true, json: async () => ({ tasks: [] }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    wrap(<OverviewPanel siteId="site-1" onNavigate={() => {}} />);
    expect(await screen.findByText('70')).toBeInTheDocument();
    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();
  });
});

describe('OverviewPanel radar', () => {
  it('shows the AI-readiness radar when all three pillars have scores', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('citation-audits/latest')) {
        return Promise.resolve({ ok: true, json: async () => ({ audits: [
          { pageUrl: 'https://acme.test/', status: 'succeeded', results: { checks: [
            { id: 'answer-position', passed: true, score: 100, weight: 15, evidence: [], recommendation: null },
            { id: 'schema-type', passed: true, score: 100, weight: 10, evidence: [], recommendation: null },
          ] } },
        ] }) });
      }
      if (url.includes('geo-audit/latest')) {
        return Promise.resolve({ ok: true, json: async () => ({ audit: { status: 'succeeded', score: 70, tier: 'good', results: { score: 70, tier: 'good', siteType: 'saas', goal: 'get-cited', signals: [], metadata: { pagesScanned: 1, candidates: 0, confirmCalls: 0 } } } }) });
      }
      if (url.includes('/tasks')) {
        return Promise.resolve({ ok: true, json: async () => ({ tasks: [] }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    wrap(<OverviewPanel siteId="site-1" onNavigate={() => {}} />);
    expect(await screen.findByText(/your ai-readiness shape/i)).toBeInTheDocument();
  });
});

// ---- new tests ----

const mkTask = (over: Record<string, unknown> = {}) => ({
  id: 't1',
  sourceType: 'citation-check',
  sourceId: 'schema-type',
  pageUrl: 'https://x.com/about',
  title: 'Schema.org type',
  foundText: '',
  fixText: 'Declare a Schema.org @type.',
  status: 'open',
  createdAt: '2026-06-09T00:00:00Z',
  statusChangedAt: '2026-06-09T00:00:00Z',
  ...over,
});

describe('OverviewPanel task-driven "Do this next"', () => {
  it('shows task title and "Show me how" link when an open task exists', async () => {
    mockTasksData = { tasks: [mkTask()] };
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('citation-audits/latest')) {
        return Promise.resolve({ ok: true, json: async () => ({ audits: [
          mkAudit('https://x.com/', [{ id: 'schema-type', passed: false, score: 0, weight: 10, evidence: [], recommendation: 'Add schema' }]),
        ] }) });
      }
      if (url.includes('geo-audit/latest')) {
        return Promise.resolve({ ok: true, json: async () => ({ audit: null }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    wrap(<OverviewPanel siteId="uid-1" onNavigate={() => {}} />);
    // Task title, not heuristic label
    expect(await screen.findByText('Schema.org type')).toBeInTheDocument();
    // "Show me how" deep-links to the readable tab for the page
    const link = await screen.findByRole('link', { name: /show me how/i });
    expect(link).toHaveAttribute('href', '/sites/uid-1?tab=readable&page=about');
  });
});

describe('OverviewPanel heuristic card with AddTaskButton', () => {
  it('shows heuristic card and add-task button when no open tasks but failing checks exist', async () => {
    mockTasksData = { tasks: [] };
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('citation-audits/latest')) {
        return Promise.resolve({ ok: true, json: async () => ({ audits: [
          mkAudit('https://x.com/', [{ id: 'schema-type', passed: false, score: 0, weight: 10, evidence: [], recommendation: 'Add schema' }]),
        ] }) });
      }
      if (url.includes('geo-audit/latest')) {
        return Promise.resolve({ ok: true, json: async () => ({ audit: null }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    wrap(<OverviewPanel siteId="s1" onNavigate={() => {}} />);
    expect(await screen.findByText(/do this next/i)).toBeInTheDocument();
    // The heuristic label for schema-type
    expect(screen.getByText('Schema.org type')).toBeInTheDocument();
    // AddTaskButton rendered with the correct sourceId
    expect(screen.getByTestId('add-task-schema-type')).toBeInTheDocument();
  });
});

describe('OverviewPanel "All tasks" accordion', () => {
  it('shows accordion when tasks exist', async () => {
    mockTasksData = { tasks: [mkTask()] };
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('citation-audits/latest')) {
        return Promise.resolve({ ok: true, json: async () => ({ audits: [] }) });
      }
      if (url.includes('geo-audit/latest')) {
        return Promise.resolve({ ok: true, json: async () => ({ audit: null }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    wrap(<OverviewPanel siteId="s1" onNavigate={() => {}} />);
    expect(await screen.findByText(/all tasks/i)).toBeInTheDocument();
  });

  it('does not show accordion when no tasks', async () => {
    mockTasksData = { tasks: [] };
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('citation-audits/latest')) {
        return Promise.resolve({ ok: true, json: async () => ({ audits: [] }) });
      }
      if (url.includes('geo-audit/latest')) {
        return Promise.resolve({ ok: true, json: async () => ({ audit: null }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    wrap(<OverviewPanel siteId="s1" onNavigate={() => {}} />);
    // Wait for the component to settle
    await screen.findByText(/loading readiness/i).catch(() => null);
    // Give it a moment to resolve
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText(/all tasks/i)).not.toBeInTheDocument();
  });
});
