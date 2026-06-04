import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AppShell } from './app-shell';

vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard' }));
vi.mock('@/components/auth/user-menu', () => ({ UserMenu: () => <div>user-menu</div> }));

describe('AppShell', () => {
  it('renders children and the sidebar', () => {
    render(<AppShell userEmail="tim@x.com"><p>hello content</p></AppShell>);
    expect(screen.getByText('hello content')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Dashboard' }).length).toBeGreaterThan(0);
  });

  it('toggles the mobile drawer', () => {
    render(<AppShell userEmail="tim@x.com"><p>c</p></AppShell>);
    const toggle = screen.getByRole('button', { name: /menu/i });
    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();
  });
});
