import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { WebhookBlock } from './webhook-block';

describe('WebhookBlock', () => {
  it('shows masked token by default', () => {
    render(<WebhookBlock siteId={1} tokenPrefix="lmt_aaaa" onRotate={vi.fn()} />);
    expect(screen.getByText(/lmt_aaaa/)).toBeInTheDocument();
    expect(screen.getByText(/•+/)).toBeInTheDocument();
  });

  it('shows fresh token when freshToken prop is set', () => {
    render(
      <WebhookBlock siteId={1} tokenPrefix="lmt_aaaa" freshToken="lmt_aaaaSECRET" onRotate={vi.fn()} />,
    );
    expect(screen.getByDisplayValue('lmt_aaaaSECRET')).toBeInTheDocument();
  });

  it('calls onRotate when rotate clicked', async () => {
    const onRotate = vi.fn();
    render(<WebhookBlock siteId={1} tokenPrefix="lmt_aaaa" onRotate={onRotate} />);
    await userEvent.click(screen.getByRole('button', { name: /rotate/i }));
    expect(onRotate).toHaveBeenCalled();
  });
});
