import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { RegenerateButton } from './regenerate-button';

describe('RegenerateButton', () => {
  it('opens popover and submits with email toggle off by default', async () => {
    const onSubmit = vi.fn();
    render(<RegenerateButton siteId="22222222-2222-4222-8222-222222222222" onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole('button', { name: /regenerate/i }));
    await userEvent.click(screen.getByRole('button', { name: /confirm/i }));
    expect(onSubmit).toHaveBeenCalledWith({ siteId: '22222222-2222-4222-8222-222222222222', notifyEmail: false });
  });

  it('passes notifyEmail when toggle checked', async () => {
    const onSubmit = vi.fn();
    render(<RegenerateButton siteId="22222222-2222-4222-8222-222222222222" onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole('button', { name: /regenerate/i }));
    await userEvent.click(screen.getByLabelText(/email me when done/i));
    await userEvent.click(screen.getByRole('button', { name: /confirm/i }));
    expect(onSubmit).toHaveBeenCalledWith({ siteId: '22222222-2222-4222-8222-222222222222', notifyEmail: true });
  });
});
