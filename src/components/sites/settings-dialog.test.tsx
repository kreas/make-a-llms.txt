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
  details: {
    name: 'Acme Docs',
    displayName: 'Acme',
    description: 'Acme makes widgets.',
    faviconUrl: 'https://acme.test/favicon.ico',
  },
  onSaveDetails: vi.fn(),
  isSavingDetails: false,
  onRecaptureDetails: vi.fn(),
  isRecapturing: false,
  detailsError: null as string | null,
};

async function openWebhookTab() {
  await userEvent.click(screen.getByRole('tab', { name: /webhook/i }));
}

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

  it('shows the site name and webhook URL when open', async () => {
    render(<SettingsDialog {...baseProps} />);
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('Acme Docs')).toBeInTheDocument();
    await openWebhookTab();
    const urlMatches = screen.getAllByText(/\/api\/webhooks\/sites\/33333333-3333-4333-8333-333333333333\/regenerate/);
    expect(urlMatches.length).toBeGreaterThan(0);
  });

  it('shows masked token + placeholder hint when no fresh token', async () => {
    render(<SettingsDialog {...baseProps} />);
    await openWebhookTab();
    expect(screen.getByText(/lmt_xxxx•+/)).toBeInTheDocument();
    expect(screen.getByText(/Replace/)).toBeInTheDocument();
    const placeholderMatches = screen.getAllByText(/<YOUR_WEBHOOK_TOKEN>/);
    expect(placeholderMatches.length).toBeGreaterThan(0);
  });

  it('shows fresh token with one-time warning when provided', async () => {
    render(<SettingsDialog {...baseProps} freshToken="lmt_xxxxSECRET" />);
    await openWebhookTab();
    expect(screen.getByText('lmt_xxxxSECRET')).toBeInTheDocument();
    expect(screen.getByText(/won.t see it again/i)).toBeInTheDocument();
  });

  it('inlines the fresh token into the curl snippet when available', async () => {
    render(<SettingsDialog {...baseProps} freshToken="lmt_xxxxSECRET" />);
    await openWebhookTab();
    const curlSnippet = screen.getByText(/^curl -X POST/);
    expect(curlSnippet.textContent).toContain('Bearer lmt_xxxxSECRET');
  });

  it('calls onRotate when the rotate button is clicked', async () => {
    const onRotate = vi.fn();
    render(<SettingsDialog {...baseProps} onRotate={onRotate} />);
    await openWebhookTab();
    await userEvent.click(screen.getByRole('button', { name: /rotate token/i }));
    expect(onRotate).toHaveBeenCalledTimes(1);
  });

  it('disables the rotate button while rotating', async () => {
    render(<SettingsDialog {...baseProps} isRotating />);
    await openWebhookTab();
    expect(screen.getByRole('button', { name: /rotating/i })).toBeDisabled();
  });

  it('copies the webhook URL when its copy button is clicked', async () => {
    const writeText = setupClipboard();
    render(<SettingsDialog {...baseProps} />);
    await openWebhookTab();
    await userEvent.click(screen.getByRole('button', { name: /copy webhook url/i }));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toMatch(/\/api\/webhooks\/sites\/33333333-3333-4333-8333-333333333333\/regenerate$/);
  });

  it('renders both curl and Node.js snippets', async () => {
    render(<SettingsDialog {...baseProps} />);
    await openWebhookTab();
    expect(screen.getByText(/^curl -X POST/)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /node\.js/i })).toBeInTheDocument();
  });

  describe('Details tab', () => {
    it('pre-populates fields from details prop', () => {
      render(<SettingsDialog {...baseProps} />);
      expect((screen.getByLabelText(/internal name/i) as HTMLInputElement).value).toBe('Acme Docs');
      expect((screen.getByLabelText(/brand name/i) as HTMLInputElement).value).toBe('Acme');
      expect((screen.getByLabelText(/description/i) as HTMLTextAreaElement).value).toBe(
        'Acme makes widgets.',
      );
    });

    it('disables Save until something changes', async () => {
      render(<SettingsDialog {...baseProps} />);
      expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled();
      await userEvent.clear(screen.getByLabelText(/brand name/i));
      await userEvent.type(screen.getByLabelText(/brand name/i), 'Acme Co');
      expect(screen.getByRole('button', { name: /save changes/i })).toBeEnabled();
    });

    it('sends only the diff to onSaveDetails', async () => {
      const onSaveDetails = vi.fn();
      render(<SettingsDialog {...baseProps} onSaveDetails={onSaveDetails} />);
      await userEvent.clear(screen.getByLabelText(/brand name/i));
      await userEvent.type(screen.getByLabelText(/brand name/i), 'Acme Co');
      await userEvent.click(screen.getByRole('button', { name: /save changes/i }));
      expect(onSaveDetails).toHaveBeenCalledWith({ displayName: 'Acme Co' });
    });

    it('treats empty inputs as null in the diff', async () => {
      const onSaveDetails = vi.fn();
      render(<SettingsDialog {...baseProps} onSaveDetails={onSaveDetails} />);
      await userEvent.clear(screen.getByLabelText(/brand name/i));
      await userEvent.clear(screen.getByLabelText(/description/i));
      await userEvent.click(screen.getByRole('button', { name: /save changes/i }));
      expect(onSaveDetails).toHaveBeenCalledWith({ displayName: null, description: null });
    });

    it('calls onRecaptureDetails when Recapture is clicked', async () => {
      const onRecaptureDetails = vi.fn();
      render(<SettingsDialog {...baseProps} onRecaptureDetails={onRecaptureDetails} />);
      await userEvent.click(screen.getByRole('button', { name: /recapture/i }));
      expect(onRecaptureDetails).toHaveBeenCalledTimes(1);
    });

    it('shows detailsError when present', () => {
      render(<SettingsDialog {...baseProps} detailsError="boom" />);
      expect(screen.getByText('boom')).toBeInTheDocument();
    });
  });
});
