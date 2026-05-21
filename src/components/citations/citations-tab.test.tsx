import { render, screen, waitFor } from '@testing-library/react';
import { test, expect, beforeEach, vi } from 'vitest';
import { withQueryClient } from '@/test/utils';
import { CitationsTab } from './citations-tab';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (typeof url === 'string' && url.endsWith('/citation-audits/latest'))
      return new Response(JSON.stringify({ audits: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
    // Pages manifest endpoint returns one ok page
    return new Response(JSON.stringify({ status: 'succeeded', pages: [{ url: 'https://x.com/a', status: 'ok' }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  }));
});

test('lists pages from the manifest with no audits yet', async () => {
  render(withQueryClient(<CitationsTab siteId="site_1" latestGenUid="gen-uid-1" />));
  // Tree shows the last path segment, not the full URL.
  await waitFor(() => expect(screen.getByText('a')).toBeInTheDocument());
  expect(screen.getByText('Never audited')).toBeInTheDocument();
});
