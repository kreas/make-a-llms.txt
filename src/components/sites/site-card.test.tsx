import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SiteCard } from './site-card';
import type { Site, Generation } from '@/db/schema';

const mkSite = (over: Partial<Site> = {}): Site => ({
  id: 1,
  uid: '00000000-0000-0000-0000-000000000001',
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

const mkGen = (over: Partial<Generation> = {}): Generation => ({
  id: 1,
  siteId: 1,
  userId: 1,
  status: 'succeeded',
  trigger: 'manual',
  notifyEmail: false,
  notifiedAt: null,
  workflowRunId: null,
  resolvedSitemapUrl: null,
  llmsBlobPath: null,
  llmsFullBlobPath: null,
  errorMessage: null,
  startedAt: null,
  completedAt: null,
  createdAt: '2026-05-07T00:00:00Z',
  updatedAt: '2026-05-07T00:00:00Z',
  ...over,
});

describe('SiteCard', () => {
  it('shows status badge and View link to /sites/[id]', () => {
    render(<SiteCard site={mkSite()} latest={mkGen({ status: 'succeeded' })} />);
    expect(screen.getByText(/done/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View' })).toHaveAttribute('href', '/sites/1');
  });

  it('disables the action button when status is running (in-flight)', () => {
    render(<SiteCard site={mkSite()} latest={mkGen({ status: 'running' })} />);
    const btn = screen.getByRole('button', { name: /run now/i });
    expect(btn).toBeDisabled();
  });

  it('shows Retry label when status is failed', () => {
    render(<SiteCard site={mkSite()} latest={mkGen({ status: 'failed' })} />);
    expect(screen.getByRole('link', { name: 'Retry' })).toBeInTheDocument();
  });

  it('shows Run Now when latest is null (no generation yet)', () => {
    render(<SiteCard site={mkSite()} latest={null} />);
    // status defaults to pending when no generation — pending is in-flight, so button is disabled
    expect(screen.getByRole('button', { name: /run now/i })).toBeDisabled();
  });
});
