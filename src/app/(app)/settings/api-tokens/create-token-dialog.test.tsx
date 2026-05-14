import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreateTokenDialog } from './create-token-dialog';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

describe('CreateTokenDialog', () => {
  it('shows the raw token exactly once after create', async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        token: 'mklt_pat_secret123',
        record: { id: 1, name: 'CI', tokenPrefix: 'mklt_pat_se', createdAt: '', expiresAt: null },
      }),
    });
    const onCreated = vi.fn();
    render(<CreateTokenDialog open onOpenChange={() => {}} onCreated={onCreated} />);
    await userEvent.type(screen.getByLabelText(/name/i), 'CI');
    await userEvent.click(screen.getByRole('button', { name: /create/i }));
    expect(await screen.findByText('mklt_pat_secret123')).toBeInTheDocument();
    expect(onCreated).toHaveBeenCalled();
  });

  it('disables Create when name is empty', () => {
    render(<CreateTokenDialog open onOpenChange={() => {}} onCreated={() => {}} />);
    expect(screen.getByRole('button', { name: /create/i })).toBeDisabled();
  });
});
