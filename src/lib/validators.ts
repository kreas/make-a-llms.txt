import { z } from 'zod';

export function normalizeRootUrl(input: string): string {
  const u = new URL(input);
  return `${u.protocol}//${u.host.toLowerCase()}`;
}

const httpUrl = z
  .string()
  .url()
  .refine((u) => /^https?:\/\//i.test(u), 'must start with http:// or https://');

export const createSiteSchema = z
  .object({
    name: z.string().min(1).max(80),
    rootUrl: httpUrl,
    sitemapUrl: httpUrl.optional(),
  })
  .transform((v) => ({ ...v, rootUrl: normalizeRootUrl(v.rootUrl) }));

export const updateSiteSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  displayName: z.string().min(1).max(80).nullable().optional(),
  description: z.string().max(500).nullable().optional(),
  sitemapUrl: httpUrl.nullable().optional(),
});

const generationFromSiteId = z.object({
  siteId: z.string().uuid(),
  notifyEmail: z.boolean().optional(),
}).strict();

const generationFromInlineSite = z
  .object({
    name: z.string().min(1).max(80),
    rootUrl: httpUrl,
    sitemapUrl: httpUrl.optional(),
    notifyEmail: z.boolean().optional(),
  })
  .strict()
  .transform((v) => ({ ...v, rootUrl: normalizeRootUrl(v.rootUrl) }));

export const createGenerationSchema = z.union([
  generationFromSiteId,
  generationFromInlineSite,
]);

export const webhookBodySchema = z.object({}).strip();

export type CreateSiteInput = z.infer<typeof createSiteSchema>;
export type UpdateSiteInput = z.infer<typeof updateSiteSchema>;
export type CreateGenerationInput = z.infer<typeof createGenerationSchema>;
