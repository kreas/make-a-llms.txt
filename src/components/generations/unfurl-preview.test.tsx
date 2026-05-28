import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UnfurlPreview } from './unfurl-preview';
import { describe, it, expect } from 'vitest';
import type { ManifestPage } from './pages-tree';

describe('UnfurlPreview Component', () => {
  const mockPage: ManifestPage = {
    url: 'https://www.hopdoddy.com/blog/2025-gt-football-guide',
    path: 'blog/2025-gt-football-guide',
    filename: '2025-gt-football-guide.md',
    status: 'ok',
    blobPath: 'blob-path-123',
  };

  const mockFields = {
    title: 'Hopdoddy | Georgia Tech Football Tailgating Guide',
    description: 'The ultimate tailgating guide for Georgia Tech Yellow Jackets fans visiting Atlanta.',
    canonical: 'https://www.hopdoddy.com/blog/2025-gt-football-guide',
    image: 'https://cdn.example.com/images/gt-guide.jpg',
  };

  it('renders all preview types when first loaded (All Previews tab active)', () => {
    render(<UnfurlPreview fields={mockFields} selectedPage={mockPage} />);

    // Check Google preview
    expect(screen.getByText('Google Search Snippet Preview')).toBeInTheDocument();
    expect(screen.getAllByText('Hopdoddy | Georgia Tech Football Tailgating Guide').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/The ultimate tailgating guide for Georgia Tech/).length).toBeGreaterThan(0);

    // Check Slack preview
    expect(screen.getByText('Slack Rich Unfurl Preview')).toBeInTheDocument();
    expect(screen.getAllByText('Hopdoddy').length).toBeGreaterThan(0); // Brand name check

    // Check Twitter preview
    expect(screen.getByText('Twitter / X Large Image Card Preview')).toBeInTheDocument();
    expect(screen.getByText('hopdoddy.com')).toBeInTheDocument(); // Domain check
  });

  it('allows clicking individual preview tabs to filter views', async () => {
    render(<UnfurlPreview fields={mockFields} selectedPage={mockPage} />);

    const googleTab = screen.getByRole('button', { name: /google/i });
    const slackTab = screen.getByRole('button', { name: /slack/i });

    // Click Google tab
    await userEvent.click(googleTab);
    expect(screen.getByText('Google Search Snippet Preview')).toBeInTheDocument();
    expect(screen.queryByText('Slack Rich Unfurl Preview')).not.toBeInTheDocument();
    expect(screen.queryByText('Twitter / X Large Image Card Preview')).not.toBeInTheDocument();

    // Click Slack tab
    await userEvent.click(slackTab);
    expect(screen.queryByText('Google Search Snippet Preview')).not.toBeInTheDocument();
    expect(screen.getByText('Slack Rich Unfurl Preview')).toBeInTheDocument();
    expect(screen.queryByText('Twitter / X Large Image Card Preview')).not.toBeInTheDocument();
  });

  it('uses fallback information when fields are missing', () => {
    const emptyFields = {};
    render(<UnfurlPreview fields={emptyFields} selectedPage={mockPage} />);

    // Fallbacks to page filename or path
    expect(screen.getAllByText('2025-gt-football-guide.md').length).toBeGreaterThan(0);
    
    // Shows cover image fallback placeholder text
    expect(screen.getByText('No cover image specified')).toBeInTheDocument();
    expect(screen.getByText('No og:image specified')).toBeInTheDocument();
  });
});
