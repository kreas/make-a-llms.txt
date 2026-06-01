import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SiteHeader } from './site-header';
import { withQueryClient } from '@/test/utils';

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

describe('SiteHeader', () => {
  it('renders the brand logo home link', () => {
    render(withQueryClient(<SiteHeader />));
    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument();
  });

  describe('when authenticated (default)', () => {
    it('renders the authenticated nav links', () => {
      render(withQueryClient(<SiteHeader />));
      expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Pricing' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Blog' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Docs' })).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'API Tokens' })).not.toBeInTheDocument();
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

    it('does not render Sign In or Sign Up buttons', () => {
      render(withQueryClient(<SiteHeader />));
      expect(screen.queryByRole('link', { name: 'Sign In' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Sign Up' })).not.toBeInTheDocument();
    });
  });

  describe('when unauthenticated', () => {
    it('renders the unauthenticated nav links', () => {
      render(withQueryClient(<SiteHeader authenticated={false} />));
      expect(screen.queryByRole('link', { name: 'Dashboard' })).not.toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Pricing' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Blog' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Docs' })).toBeInTheDocument();
    });

    it('renders Sign In and Sign Up buttons and not user menu or new project CTA', () => {
      render(withQueryClient(<SiteHeader authenticated={false} />));
      expect(screen.getByRole('link', { name: 'Sign In' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Sign Up' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /open user menu/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /new project/i })).not.toBeInTheDocument();
    });
  });
});

