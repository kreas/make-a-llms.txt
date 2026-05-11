import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { AddSiteCard } from './add-site-card';

describe('AddSiteCard', () => {
  it('renders the label and links to /sites/new', () => {
    render(<AddSiteCard />);
    expect(screen.getByText('Add New Project')).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/sites/new');
  });
});
