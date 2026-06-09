import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SiteDetailClient } from './site-detail-client';
import type { Site } from '@/db/schema';

const replace = vi.fn();
let search = new URLSearchParams('');
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, refresh: vi.fn() }),
  usePathname: () => '/sites/uid-1',
  useSearchParams: () => search,
}));
vi.mock('@/components/layout/app-shell-rail', () => ({
  useAppShellRail: () => ({ mount: document.body, setActive: vi.fn() }),
}));
vi.mock('@/components/layout/app-shell-header', () => ({
  useAppShellHeader: () => ({ mount: document.body, setActive: vi.fn() }),
}));
vi.mock('@/components/layout/app-shell-sidebar-slot', () => ({
  useAppShellSidebarSlot: () => ({ mount: document.body, active: true, setActive: vi.fn() }),
}));
vi.mock('@/components/generations/overview-panel', () => ({ OverviewPanel: () => <div>overview-panel</div> }));
vi.mock('@/components/generations/readable-panel', () => ({ ReadablePanel: () => <div>readable-panel</div> }));
vi.mock('@/components/generations/recommendable-panel', () => ({ RecommendablePanel: () => <div>recommendable-panel</div> }));
vi.mock('@/components/generations/recognized-panel', () => ({ RecognizedPanel: () => <div>recognized-panel</div> }));
vi.mock('@/components/generations/setup-panel', () => ({ SetupPanel: () => <div>setup-panel</div> }));
vi.mock('@/components/generations/pages-rail', () => ({ PagesRail: () => <div>pages-rail</div> }));
vi.mock('@/components/tasks/tasks-panel', () => ({ TasksPanel: () => <div>tasks-panel</div> }));
vi.mock('@/components/sites/settings-dialog', () => ({ SettingsDialog: () => null }));
vi.mock('@/hooks/use-site-tasks', () => ({
  useSiteTasks: () => ({
    data: { tasks: [{ id: 't1', status: 'open' }, { id: 't2', status: 'done' }] },
    isLoading: false,
  }),
}));

const site = {
  id: 1, uid: 'uid-1', name: 'Example', displayName: 'Example', description: null,
  rootUrl: 'https://example.com', faviconUrl: null, userId: 1,
  webhookTokenHash: 'h'.repeat(64), webhookTokenPrefix: 'lmt_hhhh',
} as unknown as Site;

function renderClient() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SiteDetailClient site={site} generations={[]} />
    </QueryClientProvider>,
  );
}

describe('SiteDetailClient tasks tab', () => {
  it('lists Tasks in the sidebar nav with the open count badge', () => {
    renderClient();
    const tasksBtn = screen.getByRole('button', { name: /tasks/i });
    expect(tasksBtn).toBeInTheDocument();
    expect(tasksBtn).toHaveTextContent('1'); // 1 open of 2 tasks
  });

  it('renders the TasksPanel when ?tab=tasks', () => {
    search = new URLSearchParams('tab=tasks');
    renderClient();
    expect(screen.getByText('tasks-panel')).toBeInTheDocument();
    search = new URLSearchParams('');
  });
});
