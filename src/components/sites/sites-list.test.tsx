import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SitesList } from './sites-list';
import type { Site } from '@/db/schema';

const mkSite = (over: Partial<Site> = {}): Site => ({
  id: 1,
  userId: 1,
  name: 'Acme',
  rootUrl: 'https://acme.com',
  sitemapUrl: null,
  webhookTokenHash: 'h',
  webhookTokenPrefix: 'lmt_xxxx',
  lastGeneratedAt: null,
  createdAt: '2026-05-07T00:00:00Z',
  updatedAt: '2026-05-07T00:00:00Z',
  ...over,
});

describe('SitesList', () => {
  it('renders empty state', () => {
    render(<SitesList sites={[]} />);
    expect(screen.getByText(/add your first site/i)).toBeInTheDocument();
  });

  it('renders each site with its name and URL', () => {
    render(<SitesList sites={[mkSite()]} />);
    expect(screen.getByText('Acme')).toBeInTheDocument();
    expect(screen.getByText('https://acme.com')).toBeInTheDocument();
  });
});
