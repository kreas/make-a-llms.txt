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
    expect(screen.getByText('llms.txt Generator')).toBeInTheDocument();
  });

  it('renders all 3 nav links', () => {
    render(withQueryClient(<SiteHeader />));
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add Site' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Documentation' })).toBeInTheDocument();
  });

  it('renders the New Project CTA linking to /sites/new', () => {
    render(withQueryClient(<SiteHeader />));
    const cta = screen.getByRole('link', { name: 'New Project' });
    expect(cta).toBeInTheDocument();
    expect(cta).toHaveAttribute('href', '/sites/new');
  });

  it('applies active border class to the current route nav link', () => {
    render(withQueryClient(<SiteHeader />));
    const dashLink = screen.getByRole('link', { name: 'Dashboard' });
    expect(dashLink.className).toContain('border-primary');
  });
});
