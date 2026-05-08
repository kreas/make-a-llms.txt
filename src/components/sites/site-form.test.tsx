import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { SiteForm } from './site-form';

describe('SiteForm', () => {
  it('calls onSubmit with valid input', async () => {
    const onSubmit = vi.fn();
    render(<SiteForm onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText(/name/i), 'Acme');
    await userEvent.type(screen.getByLabelText(/website url/i), 'https://acme.com');
    await userEvent.click(screen.getByRole('button', { name: /create site/i }));
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Acme',
      rootUrl: 'https://acme.com',
      sitemapUrl: undefined,
    });
  });

  it('shows error when URL is invalid', async () => {
    const onSubmit = vi.fn();
    render(<SiteForm onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText(/name/i), 'A');
    await userEvent.type(screen.getByLabelText(/website url/i), 'bogus');
    await userEvent.click(screen.getByRole('button', { name: /create site/i }));
    expect(await screen.findByText(/valid url|http/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
