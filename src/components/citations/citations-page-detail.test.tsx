import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { withQueryClient } from '@/test/utils';
import { CitationsPageDetail } from './citations-page-detail';

const successAudit = {
  id: 'cit_1', pageUrl: 'https://x.com/a', status: 'succeeded' as const, score: 78, tier: 'good' as const,
  fetchedAt: new Date().toISOString(), errorReason: null, errorMessage: null,
  results: {
    score: 78, tier: 'good' as const,
    checks: [
      { id: 'h1-present', passed: true, score: 100, weight: 5, evidence: ['H1 found'], recommendation: null },
      { id: 'answer-position', passed: false, score: 40, weight: 15, evidence: ['Missing entity'], recommendation: 'Add entity.' },
    ],
  },
};

describe('CitationsPageDetail', () => {
  test('renders the latest audit score from history', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ audits: [successAudit] }), {
        status: 200, headers: { 'content-type': 'application/json' },
      }),
    ));
    render(withQueryClient(<CitationsPageDetail siteUid="site_1" pageUrl="https://x.com/a" onBack={() => {}} />));
    await waitFor(() => expect(screen.getByText('78')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /run new audit/i })).toBeEnabled();
  });

  test('disables the audit button while the POST is in flight', async () => {
    let resolvePost: (res: Response) => void = () => {};
    const pendingPost = new Promise<Response>((r) => { resolvePost = r; });
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return pendingPost;
      return new Response(JSON.stringify({ audits: [successAudit] }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    }));
    render(withQueryClient(<CitationsPageDetail siteUid="site_1" pageUrl="https://x.com/a" onBack={() => {}} />));
    await waitFor(() => expect(screen.getByText('78')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /run new audit/i }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /auditing/i })).toBeDisabled(),
    );
    resolvePost(new Response(JSON.stringify({ audit: successAudit }), {
      status: 200, headers: { 'content-type': 'application/json' },
    }));
  });
});
