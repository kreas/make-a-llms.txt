import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SignOutButton } from './sign-out-button';
import { withQueryClient } from '@/test/utils';

const push = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
}));

describe('SignOutButton', () => {
  beforeEach(() => {
    push.mockReset();
    refresh.mockReset();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
  });

  it('posts to signout and redirects', async () => {
    render(withQueryClient(<SignOutButton />));
    await userEvent.click(screen.getByRole('button', { name: /sign out/i }));

    expect(fetch).toHaveBeenCalledWith('/api/auth/signout', { method: 'POST' });
    expect(push).toHaveBeenCalledWith('/signin');
    expect(refresh).toHaveBeenCalled();
  });
});
