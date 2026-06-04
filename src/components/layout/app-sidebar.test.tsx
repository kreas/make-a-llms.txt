import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppSidebar } from './app-sidebar';

vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard' }));
vi.mock('@/components/auth/user-menu', () => ({ UserMenu: () => <div>user-menu</div> }));

describe('AppSidebar', () => {
  it('renders real nav links and marks the active route', () => {
    render(<AppSidebar userEmail="tim@x.com" />);
    const dash = screen.getByRole('link', { name: 'Dashboard' });
    expect(dash).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Websites' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument();
  });

  it('renders disabled "soon" items that are not links', () => {
    render(<AppSidebar userEmail="tim@x.com" />);
    expect(screen.queryByRole('link', { name: /Audit History/ })).toBeNull();
    expect(screen.getByText('Audit History')).toBeInTheDocument();
    expect(screen.getByText('tim@x.com')).toBeInTheDocument();
  });
});
