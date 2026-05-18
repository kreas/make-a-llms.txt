import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UserMenu } from './user-menu';
import { withQueryClient } from '@/test/utils';

const push = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
}));

describe('UserMenu', () => {
  beforeEach(() => {
    push.mockReset();
    refresh.mockReset();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
    );
  });

  it('opens the menu and signs the user out', async () => {
    render(withQueryClient(<UserMenu />));

    await userEvent.click(
      screen.getByRole('button', { name: /open user menu/i }),
    );
    await userEvent.click(
      screen.getByRole('menuitem', { name: /sign out/i }),
    );

    expect(fetch).toHaveBeenCalledWith('/api/auth/signout', { method: 'POST' });
    expect(push).toHaveBeenCalledWith('/signin');
    expect(refresh).toHaveBeenCalled();
  });
});
