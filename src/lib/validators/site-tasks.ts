import { z } from 'zod';

export const createSiteTaskBodySchema = z
  .object({
    sourceType: z.enum(['citation-check', 'geo-signal', 'crawler-audit', 'setup']),
    sourceId: z.string().min(1).max(256),
    pageUrl: z.string().max(2048).default(''),
    title: z.string().min(1).max(500),
    foundText: z.string().max(2000).default(''),
    fixText: z.string().max(2000).default(''),
  })
  .strict();

export const patchSiteTaskBodySchema = z
  .object({
    // 'verified' is intentionally absent: it is system-set by reconciliation.
    status: z.enum(['open', 'done', 'wont_do']),
  })
  .strict();

export type CreateSiteTaskBody = z.infer<typeof createSiteTaskBodySchema>;
export type PatchSiteTaskBody = z.infer<typeof patchSiteTaskBodySchema>;
