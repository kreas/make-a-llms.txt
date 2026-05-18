import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SiteHeader } from './site-header';
import { withQueryClient } from '@/test/utils';

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

describe('SiteHeader', () => {
  it('renders the wordmark', () => {
    render(withQueryClient(<SiteHeader />));
    expect(screen.getByText('AI Ready')).toBeInTheDocument();
  });

  it('renders the streamlined nav links', () => {
    render(withQueryClient(<SiteHeader />));
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'API Tokens' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Docs' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Add Site' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Documentation' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'API Docs' })).not.toBeInTheDocument();
  });

  it('renders the New project CTA as an icon link to /sites/new', () => {
    render(withQueryClient(<SiteHeader />));
    const cta = screen.getByRole('link', { name: /new project/i });
    expect(cta).toBeInTheDocument();
    expect(cta).toHaveAttribute('href', '/sites/new');
  });

  it('renders the user menu trigger', () => {
    render(withQueryClient(<SiteHeader />));
    expect(
      screen.getByRole('button', { name: /open user menu/i }),
    ).toBeInTheDocument();
  });
});
