import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SiteFooter } from './site-footer';

describe('SiteFooter', () => {
  it('renders the copyright line and all 4 links', () => {
    render(<SiteFooter />);
    expect(screen.getByText(/LLMS\.TXT ARCHITECT/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Privacy' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Terms' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'GitHub' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'API Documentation' })).toBeInTheDocument();
  });
});
