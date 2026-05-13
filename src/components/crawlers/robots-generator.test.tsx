import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RobotsGenerator } from './robots-generator';
import { KNOWN_AI_BOTS, type AuditResults } from '@/lib/known-ai-bots';

function defaultResults(): AuditResults {
  return Object.fromEntries(
    KNOWN_AI_BOTS.map((b) => [b, { status: 'default' as const }]),
  ) as AuditResults;
}

describe('RobotsGenerator', () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('renders a toggle row for every known bot', () => {
    render(<RobotsGenerator initial={defaultResults()} />);
    for (const bot of KNOWN_AI_BOTS) {
      expect(screen.getByText(bot)).toBeInTheDocument();
    }
  });

  it('seeds initial toggle state from the audit results', () => {
    const seeded = { ...defaultResults(), GPTBot: { status: 'blocked' as const } };
    render(<RobotsGenerator initial={seeded} />);
    // The blocked button for GPTBot has aria-pressed=true
    const row = screen.getByText('GPTBot').closest('tr')!;
    const buttons = row.querySelectorAll('button');
    // Two buttons per row: Allow, Block
    expect(buttons[1].getAttribute('aria-pressed')).toBe('true');
  });

  it('clicking Block updates the snippet', async () => {
    const user = userEvent.setup();
    render(<RobotsGenerator initial={defaultResults()} />);
    const row = screen.getByText('GPTBot').closest('tr')!;
    const blockBtn = row.querySelectorAll('button')[1];
    await user.click(blockBtn);

    expect(screen.getByTestId('snippet')).toHaveTextContent('User-agent: GPTBot');
    expect(screen.getByTestId('snippet')).toHaveTextContent('Disallow: /');
  });

  it('clicking the highlighted state again resets the bot to default', async () => {
    const user = userEvent.setup();
    const seeded = { ...defaultResults(), GPTBot: { status: 'blocked' as const } };
    render(<RobotsGenerator initial={seeded} />);
    const row = screen.getByText('GPTBot').closest('tr')!;
    const blockBtn = row.querySelectorAll('button')[1];
    await user.click(blockBtn);

    expect(screen.getByTestId('snippet')).not.toHaveTextContent('User-agent: GPTBot');
  });

  it('Reset button restores the initial state', async () => {
    const user = userEvent.setup();
    const seeded = { ...defaultResults(), GPTBot: { status: 'blocked' as const } };
    render(<RobotsGenerator initial={seeded} />);
    const row = screen.getByText('GPTBot').closest('tr')!;
    const allowBtn = row.querySelectorAll('button')[0];
    await user.click(allowBtn);

    expect(screen.getByTestId('snippet')).toHaveTextContent('Allow: /');

    await user.click(screen.getByRole('button', { name: /reset/i }));
    expect(screen.getByTestId('snippet')).toHaveTextContent('Disallow: /');
  });

  it('Copy button writes the snippet to the clipboard', async () => {
    const user = userEvent.setup();
    const seeded = { ...defaultResults(), GPTBot: { status: 'blocked' as const } };
    render(<RobotsGenerator initial={seeded} />);
    await user.click(screen.getByRole('button', { name: /copy/i }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining('User-agent: GPTBot'),
    );
  });

  it('renders a placeholder when all bots are default', () => {
    render(<RobotsGenerator initial={defaultResults()} />);
    expect(screen.getByTestId('snippet')).toHaveTextContent(
      '# (No directives — toggle a bot to begin)',
    );
  });
});
