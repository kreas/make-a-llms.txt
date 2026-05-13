import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SiteFooter } from './site-footer';

describe('SiteFooter', () => {
  it('renders the brand wordmark and the copyright line', () => {
    render(<SiteFooter />);
    expect(screen.getByText('AI Ready')).toBeInTheDocument();
    expect(screen.getByText(/AI Ready\. Built for the next billion builders/i)).toBeInTheDocument();
  });

  it('renders the Resources column links', () => {
    render(<SiteFooter />);
    expect(screen.getByRole('heading', { name: /resources/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Privacy' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Terms' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Security' })).toBeInTheDocument();
  });

  it('renders the Community column links', () => {
    render(<SiteFooter />);
    expect(screen.getByRole('heading', { name: /community/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'GitHub' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Status' })).toBeInTheDocument();
  });
});
