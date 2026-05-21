import type { Generation } from '@/db/schema';

export type SitePublic = {
  id: string;
  name: string;
  displayName: string | null;
  description: string | null;
  faviconUrl: string | null;
  rootUrl: string;
  sitemapUrl: string | null;
  webhookTokenPrefix: string;
  lastGeneratedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type GenerationPublic = {
  id: string;
  siteId: string;
  status: Generation['status'];
  trigger: Generation['trigger'];
  pagesStatus: Generation['pagesStatus'];
  pagesCount: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
};

export type GenerationViewPublic = {
  id: string;
  status: Generation['status'];
  pages: { status: Generation['pagesStatus']; count: number; errorMessage?: string };
  summaries: {
    status: Generation['summariesStatus'];
    count: number;
    emptyCount: number;
    failedCount: number;
    errorMessage?: string;
  };
  files: {
    llms: { ready: boolean; url?: string };
    llmsFull: { ready: boolean; url?: string };
    pages: { ready: boolean; url?: string };
  };
  errorMessage?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
};

export type ApiTokenPublic = {
  id: string;
  name: string;
  tokenPrefix: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};
