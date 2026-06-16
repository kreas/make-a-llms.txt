import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReadablePanel } from './readable-panel';
import { PageWorkspaceProvider } from './page-workspace-context';
import type { Generation } from '@/db/schema';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('../citations/citations-page-detail', () => ({
  CitationsPageDetail: ({ pageUrl }: { pageUrl: string }) => <div>audit:{pageUrl}</div>,
}));

// jsPDF is heavy and irrelevant here — assert the handler fires; the builder is
// covered in report-pdf.test.ts.
vi.mock('@/lib/citation-audit/report-pdf', () => ({ downloadAuditReportPdf: vi.fn() }));
import { downloadAuditReportPdf } from '@/lib/citation-audit/report-pdf';

// radix menu interactions rely on pointer-capture / scroll APIs jsdom lacks.
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.scrollIntoView = () => {};
});

const gen = { id: 1, uid: 'gen-1', pagesStatus: 'succeeded' } as unknown as Generation;

const audit = {
  id: 'cit_1', pageUrl: 'https://x.com/', status: 'succeeded', score: 78, tier: 'good',
  fetchedAt: '2026-06-16T09:30:00.000Z', errorReason: null, errorMessage: null,
  results: {
    score: 78, tier: 'good', pageTitle: 'Home',
    checks: [{ id: 'h1-present', passed: true, score: 100, weight: 5, evidence: [], recommendation: null }],
  },
};

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.includes('citation-audits')) {
      return new Response(JSON.stringify({ audits: [audit] }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    }
    if (url.includes('/pages?') || url.endsWith('/pages')) {
      return new Response(JSON.stringify({ status: 'succeeded', pages: [{ path: 'index', url: 'https://x.com/', status: 'ok' }] }), { status: 200 });
    }
    return new Response('---\ntitle: Home\n---\nbody', { status: 200 });
  }));
  return render(
    <QueryClientProvider client={client}>
      <PageWorkspaceProvider generation={gen}>
        <ReadablePanel siteId="site-1" />
      </PageWorkspaceProvider>
    </QueryClientProvider>,
  );
}

describe('ReadablePanel', () => {
  it('shows the Citation Audit sub-tab for the auto-selected index page', async () => {
    setup();
    expect(await screen.findByText('audit:https://x.com/')).toBeInTheDocument();
  });

  it('exposes a pages.md sub-tab trigger', async () => {
    setup();
    expect(await screen.findByText('pages.md')).toBeInTheDocument();
  });

  it('renders the Export menu as a kebab with an accessible name', async () => {
    setup();
    expect(await screen.findByRole('menuitem', { name: 'Export' })).toBeInTheDocument();
  });

  it('lists the report exports in the Export menu and triggers a PDF download', async () => {
    setup();
    const user = userEvent.setup();
    await screen.findByText('audit:https://x.com/');

    await user.click(screen.getByRole('menuitem', { name: 'Export' }));
    expect(await screen.findByText('Copy report')).toBeInTheDocument();

    const pdfItem = screen.getByText('Download report PDF');
    await waitFor(() => expect(pdfItem).not.toHaveAttribute('data-disabled'));
    await user.click(pdfItem);
    expect(downloadAuditReportPdf).toHaveBeenCalledTimes(1);
  });
});
