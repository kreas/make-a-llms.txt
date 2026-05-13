import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { CrawlerAuditTable } from './crawler-audit-table';
import { KNOWN_AI_BOTS, type AuditResults } from '@/lib/known-ai-bots';

function buildResults(overrides: Partial<AuditResults> = {}): AuditResults {
  const base = Object.fromEntries(
    KNOWN_AI_BOTS.map((b) => [b, { status: 'default' as const }]),
  ) as AuditResults;
  return { ...base, ...overrides };
}

describe('CrawlerAuditTable', () => {
  it('renders one row per known bot', () => {
    render(<CrawlerAuditTable results={buildResults()} />);
    for (const bot of KNOWN_AI_BOTS) {
      expect(screen.getByText(bot)).toBeInTheDocument();
    }
  });

  it('shows ALLOWED pill for allowed bots', () => {
    render(
      <CrawlerAuditTable
        results={buildResults({ GPTBot: { status: 'allowed' } })}
      />,
    );
    expect(screen.getByText('ALLOWED')).toBeInTheDocument();
  });

  it('shows BLOCKED pill for blocked bots', () => {
    render(
      <CrawlerAuditTable
        results={buildResults({ CCBot: { status: 'blocked' } })}
      />,
    );
    expect(screen.getByText('BLOCKED')).toBeInTheDocument();
  });

  it('shows PARTIAL pill plus disallowed paths in the detail column', () => {
    render(
      <CrawlerAuditTable
        results={buildResults({
          GPTBot: { status: 'partial', disallowedPaths: ['/admin', '/private'] },
        })}
      />,
    );
    expect(screen.getByText('PARTIAL')).toBeInTheDocument();
    expect(screen.getByText('/admin, /private')).toBeInTheDocument();
  });

  it('shows "Falls under * rules" for default bots', () => {
    render(<CrawlerAuditTable results={buildResults()} />);
    expect(screen.getAllByText('Falls under * rules').length).toBe(
      KNOWN_AI_BOTS.length,
    );
  });
});
