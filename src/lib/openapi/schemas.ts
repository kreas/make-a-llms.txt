import { z } from 'zod';
// Import zod-openapi to extend Zod's .meta() with OpenAPI-specific TypeScript types
import 'zod-openapi';
import { normalizeRootUrl } from '@/lib/validators';

const httpUrl = z
  .string()
  .url()
  .refine((u) => /^https?:\/\//i.test(u), 'must start with http:// or https://');

export const generationStatusEnum = z
  .enum(['pending', 'running', 'succeeded', 'failed', 'cancelled'])
  .meta({ id: 'GenerationStatus' });

export const pagesStatusEnum = z
  .enum(['pending', 'running', 'succeeded', 'failed', 'skipped', 'cancelled'])
  .meta({ id: 'PagesStatus' });

export const summariesStatusEnum = z
  .enum(['pending', 'running', 'succeeded', 'failed', 'skipped', 'cancelled'])
  .meta({ id: 'SummariesStatus' });

const createGenerationBySiteId = z
  .object({
    siteId: z.string().uuid(),
  })
  .strict();

const createGenerationByRootUrl = z
  .object({
    name: z.string().min(1).max(80),
    rootUrl: httpUrl,
    sitemapUrl: httpUrl.optional(),
  })
  .strict()
  .transform((v) => ({ ...v, rootUrl: normalizeRootUrl(v.rootUrl) }));

export const createGenerationV1Schema = z
  .union([createGenerationBySiteId, createGenerationByRootUrl])
  .meta({
    id: 'CreateGenerationRequest',
    override: ({ jsonSchema }) => {
      if (jsonSchema.anyOf) {
        jsonSchema.oneOf = jsonSchema.anyOf;
        delete jsonSchema.anyOf;
      }
    },
  });

export const generationCreatedSchema = z
  .object({
    generation: z.object({
      id: z.string().uuid(),
      siteId: z.string().uuid(),
      status: generationStatusEnum,
      trigger: z.enum(['manual', 'webhook']),
      createdAt: z.string().meta({ format: 'date-time' }),
      urls: z.object({
        self: z.string(),
        llms: z.string(),
        llmsFull: z.string(),
        pages: z.string(),
      }),
    }),
  })
  .meta({ id: 'GenerationCreated' });

export const generationViewSchema = z
  .object({
    id: z.string().uuid(),
    status: generationStatusEnum,
    pages: z.object({
      status: pagesStatusEnum,
      count: z.number().int(),
      errorMessage: z.string().optional(),
    }),
    summaries: z.object({
      status: summariesStatusEnum,
      count: z.number().int(),
      emptyCount: z.number().int(),
      failedCount: z.number().int(),
      errorMessage: z.string().optional(),
    }),
    files: z.object({
      llms: z.object({ ready: z.boolean(), url: z.string().optional() }),
      llmsFull: z.object({ ready: z.boolean(), url: z.string().optional() }),
      pages: z.object({ ready: z.boolean(), url: z.string().optional() }),
    }),
    errorMessage: z.string().optional(),
    startedAt: z.string().meta({ format: 'date-time' }).optional(),
    completedAt: z.string().meta({ format: 'date-time' }).optional(),
    createdAt: z.string().meta({ format: 'date-time' }),
  })
  .meta({ id: 'GenerationView' });

export const pageManifestSchema = z
  .object({
    status: pagesStatusEnum,
    count: z.number().int(),
    pages: z.array(
      z.object({
        path: z.string(),
        url: z.string(),
        status: z.enum(['ok', 'error', 'skipped']),
        bytes: z.number().int().optional(),
      }),
    ),
  })
  .meta({ id: 'PageManifest' });

export const errorSchema = z
  .object({
    error: z.object({ code: z.string(), message: z.string() }),
  })
  .meta({ id: 'ApiError' });

export const generationListItemSchema = z
  .object({
    id: z.string().uuid(),
    siteId: z.string().uuid(),
    status: generationStatusEnum,
    trigger: z.enum(['manual', 'webhook']),
    pagesStatus: pagesStatusEnum,
    pagesCount: z.number().int(),
    createdAt: z.string().meta({ format: 'date-time' }),
    startedAt: z.string().meta({ format: 'date-time' }).optional(),
    completedAt: z.string().meta({ format: 'date-time' }).optional(),
  })
  .meta({ id: 'GenerationListItem' });

export const generationListSchema = z
  .object({
    generations: z.array(generationListItemSchema),
  })
  .meta({ id: 'GenerationList' });

export const generationCancelledSchema = z
  .object({
    generation: z.object({
      id: z.string().uuid(),
      siteId: z.string().uuid(),
      status: generationStatusEnum,
      completedAt: z.string().meta({ format: 'date-time' }).nullable().optional(),
    }),
  })
  .meta({ id: 'GenerationCancelled' });

export const listGenerationsV1QuerySchema = z
  .object({
    siteId: z.string().uuid().optional(),
    status: generationStatusEnum.optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict();

export type CreateGenerationV1Input = z.infer<typeof createGenerationV1Schema>;
export type GenerationViewDto = z.infer<typeof generationViewSchema>;
export type PageManifestDto = z.infer<typeof pageManifestSchema>;
export type GenerationListItemDto = z.infer<typeof generationListItemSchema>;
