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
  it('renders the AddSiteCard in the empty state', () => {
    render(<SitesList sites={[]} latestBySiteId={{}} />);
    expect(screen.getByText('Add New Project')).toBeInTheDocument();
  });

  it('renders each site card and the add-site card when sites exist', () => {
    render(<SitesList sites={[mkSite()]} latestBySiteId={{ 1: null }} />);
    expect(screen.getByText('Acme')).toBeInTheDocument();
    expect(screen.getByText('https://acme.com')).toBeInTheDocument();
    expect(screen.getByText('Add New Project')).toBeInTheDocument();
  });
});
