import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OtpForm } from './otp-form';
import { withQueryClient } from '@/test/utils';

const push = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
}));

describe('OtpForm', () => {
  beforeEach(() => {
    push.mockReset();
    refresh.mockReset();
  });

  it('shows the email and lets the user go back', async () => {
    const onBack = vi.fn();
    render(withQueryClient(<OtpForm email="user@example.com" onBack={onBack} />));

    expect(screen.getByText(/user@example\.com/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(onBack).toHaveBeenCalled();
  });

  it('verifies the code and redirects on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    render(withQueryClient(<OtpForm email="user@example.com" onBack={vi.fn()} />));

    await userEvent.keyboard('123456');
    await userEvent.click(screen.getByRole('button', { name: 'Verify' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/'));
    expect(fetch).toHaveBeenCalledWith(
      '/api/auth/verify',
      expect.objectContaining({ method: 'POST' }),
    );
    const call = (fetch as unknown as { mock: { calls: [string, { body: string }][] } }).mock
      .calls[0];
    expect(JSON.parse(call[1].body)).toEqual({ email: 'user@example.com', code: '123456' });
  });

  it('surfaces server errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'Invalid code' }) }),
    );
    render(withQueryClient(<OtpForm email="user@example.com" onBack={vi.fn()} />));

    await userEvent.keyboard('999999');
    await userEvent.click(screen.getByRole('button', { name: 'Verify' }));

    expect(await screen.findByText('Invalid code')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
