import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CrawlerAuditTable } from './crawler-audit-table';

vi.mock('@/components/tasks/add-task-button', () => ({
  AddTaskButton: ({ finding }: { finding: { sourceId: string } }) => (
    <div data-testid={`add-task-${finding.sourceId}`} />
  ),
}));

describe('CrawlerAuditTable', () => {
  it('renders one row per provided bot', () => {
    const rows = [
      { bot: 'GPTBot', status: 'allowed' as const },
      { bot: 'ClaudeBot', status: 'blocked' as const },
    ];
    render(<CrawlerAuditTable rows={rows} siteUid="s1" />);
    expect(screen.getByText('GPTBot')).toBeInTheDocument();
    expect(screen.getByText('ClaudeBot')).toBeInTheDocument();
  });

  it('renders the status pill text uppercase', () => {
    render(<CrawlerAuditTable rows={[{ bot: 'GPTBot', status: 'allowed' }]} siteUid="s1" />);
    expect(screen.getByText('ALLOWED')).toBeInTheDocument();
  });

  it('no longer renders a DEFAULT status', () => {
    render(
      <CrawlerAuditTable
        siteUid="s1"
        rows={[
          {
            bot: 'GPTBot',
            status: 'allowed',
            reason: 'Inherits allow from User-agent: *',
          },
        ]}
      />,
    );
    expect(screen.queryByText('DEFAULT')).toBeNull();
  });

  it('renders the pill when a reason is provided (tooltip wraps it)', () => {
    render(
      <CrawlerAuditTable
        siteUid="s1"
        rows={[
          { bot: 'GPTBot', status: 'partial', reason: 'Blocked paths: /admin' },
        ]}
      />,
    );
    const pill = screen.getByText('PARTIAL');
    expect(pill).toBeInTheDocument();
  });

  it('renders the pill when no reason is provided (plain span)', () => {
    render(<CrawlerAuditTable rows={[{ bot: 'GPTBot', status: 'allowed' }]} siteUid="s1" />);
    expect(screen.getByText('ALLOWED')).toBeInTheDocument();
  });

  it('renders an add-task button only for blocked bots', () => {
    render(
      <CrawlerAuditTable
        siteUid="s1"
        rows={[
          { bot: 'GPTBot', status: 'allowed' },
          { bot: 'ClaudeBot', status: 'blocked', reason: 'Disallow: /' },
        ]}
      />,
    );
    expect(screen.getByTestId('add-task-ClaudeBot')).toBeInTheDocument();
    expect(screen.queryByTestId('add-task-GPTBot')).toBeNull();
  });
});
