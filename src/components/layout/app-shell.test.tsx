import { describe, it, expect, vi } from 'vitest';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { AppShell } from './app-shell';
import { useAppShellRail } from './app-shell-rail';
import { useAppShellHeader } from './app-shell-header';
import { useAppShellSidebarSlot } from './app-shell-sidebar-slot';

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

  it('renders a page-provided right rail when a child activates it', async () => {
    function RailUser() {
      const { mount, setActive } = useAppShellRail();
      useEffect(() => {
        setActive(true);
      }, [setActive]);
      return <>{mount && createPortal(<div>rail-content</div>, mount)}</>;
    }
    render(
      <AppShell userEmail="tim@x.com">
        <RailUser />
      </AppShell>,
    );
    expect(await screen.findByText('rail-content')).toBeInTheDocument();
  });

  it('does not render the right rail column by default', () => {
    render(<AppShell userEmail="tim@x.com"><p>c</p></AppShell>);
    expect(screen.queryByText('rail-content')).toBeNull();
  });

  it('renders a page-provided full-width header when a child activates it', async () => {
    function HeaderUser() {
      const { mount, setActive } = useAppShellHeader();
      useEffect(() => {
        setActive(true);
      }, [setActive]);
      return <>{mount && createPortal(<header>page-header-content</header>, mount)}</>;
    }
    render(
      <AppShell userEmail="tim@x.com">
        <HeaderUser />
      </AppShell>,
    );
    expect(await screen.findByText('page-header-content')).toBeInTheDocument();
  });

  it('does not render the page header slot by default', () => {
    render(<AppShell userEmail="tim@x.com"><p>c</p></AppShell>);
    expect(screen.queryByText('page-header-content')).toBeNull();
  });

  it('renders page-provided sidebar nav when a child activates the slot', async () => {
    function SidebarSlotUser() {
      const { mount, setActive } = useAppShellSidebarSlot();
      useEffect(() => {
        setActive(true);
      }, [setActive]);
      return <>{mount && createPortal(<nav>site-nav-content</nav>, mount)}</>;
    }
    render(
      <AppShell userEmail="tim@x.com">
        <SidebarSlotUser />
      </AppShell>,
    );
    expect(await screen.findByText('site-nav-content')).toBeInTheDocument();
  });

  it('hides the Websites nav item when the sidebar slot is active', async () => {
    function SidebarSlotUser() {
      const { mount, setActive } = useAppShellSidebarSlot();
      useEffect(() => {
        setActive(true);
      }, [setActive]);
      return <>{mount && createPortal(<nav>site-nav-content</nav>, mount)}</>;
    }
    render(
      <AppShell userEmail="tim@x.com">
        <SidebarSlotUser />
      </AppShell>,
    );
    await screen.findByText('site-nav-content');
    expect(screen.queryByRole('link', { name: 'Websites' })).toBeNull();
  });
});
