import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiTokensClient } from './api-tokens-client';

function withQuery(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

describe('ApiTokensClient', () => {
  it('renders a row for each token', async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        tokens: [
          { id: 1, name: 'CI', tokenPrefix: 'mklt_pat_abc', lastUsedAt: null, revokedAt: null, expiresAt: null, createdAt: '' },
        ],
      }),
    });
    render(withQuery(<ApiTokensClient />));
    expect(await screen.findByText('CI')).toBeInTheDocument();
    expect(screen.getByText(/mklt_pat_abc/)).toBeInTheDocument();
  });

  it('revokes a token after confirm', async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        tokens: [
          { id: 1, name: 'CI', tokenPrefix: 'mklt_pat_abc', lastUsedAt: null, revokedAt: null, expiresAt: null, createdAt: '' },
        ],
      }),
    });
    (fetch as any).mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    (fetch as any).mockResolvedValueOnce({ ok: true, json: async () => ({ tokens: [] }) });
    render(withQuery(<ApiTokensClient />));
    await screen.findByText('CI');
    await userEvent.click(screen.getByRole('button', { name: /revoke/i }));
    await userEvent.click(screen.getByRole('button', { name: /confirm/i }));
    await waitFor(() => {
      expect((fetch as any).mock.calls[1][0]).toBe('/api/api-tokens/1');
    });
  });
});
