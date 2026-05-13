import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { withQueryClient } from '@/test/utils';
import { CrawlerAuditTab } from './crawler-audit-tab';
import { KNOWN_AI_BOTS, type AuditResults } from '@/lib/known-ai-bots';

function emptyResults(): AuditResults {
  return Object.fromEntries(
    KNOWN_AI_BOTS.map((b) => [b, { status: 'default' as const }]),
  ) as AuditResults;
}

function mockFetch(impl: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => Promise.resolve(impl(url, init))),
  );
}

describe('CrawlerAuditTab', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows an empty state with a "Run audit now" button when latest is 404', async () => {
    mockFetch((url) => {
      if (url.endsWith('/audits/latest')) return new Response('', { status: 404 });
      return new Response('{}', { status: 200 });
    });
    render(withQueryClient(<CrawlerAuditTab siteId={1} />));
    expect(await screen.findByRole('button', { name: /run audit now/i })).toBeInTheDocument();
  });

  it('shows an error card when latest audit has status=failed', async () => {
    mockFetch((url) => {
      if (url.endsWith('/audits/latest')) {
        return new Response(
          JSON.stringify({
            audit: {
              id: 1,
              siteId: 1,
              status: 'failed',
              robotsUrl: 'https://x.test/robots.txt',
              results: JSON.stringify(emptyResults()),
              errorMessage: 'HTTP 500',
              fetchedAt: '2026-05-13T00:00:00Z',
              trigger: 'manual',
              generationId: null,
              robotsContent: null,
            },
          }),
          { status: 200 },
        );
      }
      return new Response('{}', { status: 200 });
    });
    render(withQueryClient(<CrawlerAuditTab siteId={1} />));
    expect(await screen.findByText(/HTTP 500/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('renders the table and generator on a succeeded audit', async () => {
    const results: AuditResults = {
      ...emptyResults(),
      GPTBot: { status: 'blocked' },
    };
    mockFetch((url) => {
      if (url.endsWith('/audits/latest')) {
        return new Response(
          JSON.stringify({
            audit: {
              id: 1,
              siteId: 1,
              status: 'succeeded',
              robotsUrl: 'https://x.test/robots.txt',
              results: JSON.stringify(results),
              errorMessage: null,
              fetchedAt: '2026-05-13T00:00:00Z',
              trigger: 'manual',
              generationId: null,
              robotsContent: '',
            },
          }),
          { status: 200 },
        );
      }
      return new Response('{}', { status: 200 });
    });
    render(withQueryClient(<CrawlerAuditTab siteId={1} />));
    expect(await screen.findByText('BLOCKED')).toBeInTheDocument();
    expect(screen.getByText(/generate the directives/i)).toBeInTheDocument();
  });

  it('clicking Re-audit POSTs and refreshes', async () => {
    const fetchSpy = vi.fn((url: string, init?: RequestInit) => {
      if (url.endsWith('/audits/latest')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              audit: {
                id: 1,
                siteId: 1,
                status: 'succeeded',
                robotsUrl: 'https://x.test/robots.txt',
                results: JSON.stringify(emptyResults()),
                errorMessage: null,
                fetchedAt: '2026-05-13T00:00:00Z',
                trigger: 'manual',
                generationId: null,
                robotsContent: '',
              },
            }),
            { status: 200 },
          ),
        );
      }
      if (url.endsWith('/audits') && init?.method === 'POST') {
        return Promise.resolve(new Response(JSON.stringify({ audit: {} }), { status: 200 }));
      }
      return Promise.resolve(new Response('{}', { status: 200 }));
    });
    vi.stubGlobal('fetch', fetchSpy);

    const user = userEvent.setup();
    render(withQueryClient(<CrawlerAuditTab siteId={1} />));
    await screen.findByRole('button', { name: /re-audit/i });
    await user.click(screen.getByRole('button', { name: /re-audit/i }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/sites/1/audits',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });
});
