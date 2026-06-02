import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SetupPanel } from './setup-panel';
import type { Generation } from '@/db/schema';

vi.mock('./llms-content-panel', () => ({ LlmsContentPanel: () => <div>llms-panel</div> }));
vi.mock('../crawlers/crawler-audit-tab', () => ({ CrawlerAuditTab: () => <div>crawler-panel</div> }));

function setup() {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <SetupPanel generation={{ uid: 'g1' } as unknown as Generation} siteId="s1" />
    </QueryClientProvider>,
  );
}

describe('SetupPanel', () => {
  it('shows llms.txt by default and switches to AI Crawlers', async () => {
    setup();
    expect(screen.getByText('llms-panel')).toBeInTheDocument();
    await userEvent.click(screen.getByText('AI Crawlers'));
    expect(screen.getByText('crawler-panel')).toBeInTheDocument();
  });
});
