import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SettingsDialog } from './settings-dialog';

const baseProps = {
  open: true,
  onOpenChange: vi.fn(),
  siteId: '33333333-3333-4333-8333-333333333333',
  siteName: 'Acme Docs',
  tokenPrefix: 'lmt_xxxx',
  freshToken: null as string | null,
  onRotate: vi.fn(),
  isRotating: false,
};

function setupClipboard() {
  const writeText = vi.fn(async () => {});
  Object.assign(navigator, { clipboard: { writeText } });
  return writeText;
}

describe('SettingsDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when closed', () => {
    render(<SettingsDialog {...baseProps} open={false} />);
    expect(screen.queryByText('Settings')).not.toBeInTheDocument();
  });

  it('shows the site name and webhook URL when open', () => {
    render(<SettingsDialog {...baseProps} />);
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('Acme Docs')).toBeInTheDocument();
    // URL appears in the webhook URL row AND inside each rendered snippet, so
    // assert at least one occurrence.
    const urlMatches = screen.getAllByText(/\/api\/webhooks\/sites\/33333333-3333-4333-8333-333333333333\/regenerate/);
    expect(urlMatches.length).toBeGreaterThan(0);
  });

  it('shows masked token + placeholder hint when no fresh token', () => {
    render(<SettingsDialog {...baseProps} />);
    expect(screen.getByText(/lmt_xxxx•+/)).toBeInTheDocument();
    expect(screen.getByText(/Replace/)).toBeInTheDocument();
    // Placeholder appears in both the snippet body and the hint's <code>.
    const placeholderMatches = screen.getAllByText(/<YOUR_WEBHOOK_TOKEN>/);
    expect(placeholderMatches.length).toBeGreaterThan(0);
  });

  it('shows fresh token with one-time warning when provided', () => {
    render(<SettingsDialog {...baseProps} freshToken="lmt_xxxxSECRET" />);
    expect(screen.getByText('lmt_xxxxSECRET')).toBeInTheDocument();
    expect(screen.getByText(/won.t see it again/i)).toBeInTheDocument();
  });

  it('inlines the fresh token into the curl snippet when available', () => {
    render(<SettingsDialog {...baseProps} freshToken="lmt_xxxxSECRET" />);
    const curlSnippet = screen.getByText(/^curl -X POST/);
    expect(curlSnippet.textContent).toContain('Bearer lmt_xxxxSECRET');
  });

  it('calls onRotate when the rotate button is clicked', async () => {
    const onRotate = vi.fn();
    render(<SettingsDialog {...baseProps} onRotate={onRotate} />);
    await userEvent.click(screen.getByRole('button', { name: /rotate token/i }));
    expect(onRotate).toHaveBeenCalledTimes(1);
  });

  it('disables the rotate button while rotating', () => {
    render(<SettingsDialog {...baseProps} isRotating />);
    expect(screen.getByRole('button', { name: /rotating/i })).toBeDisabled();
  });

  it('copies the webhook URL when its copy button is clicked', async () => {
    const writeText = setupClipboard();
    render(<SettingsDialog {...baseProps} />);
    await userEvent.click(screen.getByRole('button', { name: /copy webhook url/i }));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toMatch(/\/api\/webhooks\/sites\/33333333-3333-4333-8333-333333333333\/regenerate$/);
  });

  it('renders both curl and Node.js snippets', () => {
    render(<SettingsDialog {...baseProps} />);
    expect(screen.getByText(/^curl -X POST/)).toBeInTheDocument();
    // Switch to Node.js tab
    expect(screen.getByRole('tab', { name: /node\.js/i })).toBeInTheDocument();
  });
});
