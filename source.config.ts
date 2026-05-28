import { defineConfig, defineDocs, defineCollections, frontmatterSchema } from 'fumadocs-mdx/config';
import { z } from 'zod';

export const docs = defineDocs({
  dir: 'content/docs',
});

export const blog = defineDocs({
  dir: 'content/articles',
  docs: {
    schema: frontmatterSchema.extend({
      author: z.object({
        name: z.string(),
        url: z.string().optional(),
        sameAs: z.array(z.string()).optional(),
      }).optional(),
      date: z.string().or(z.date()).optional(),
      updated: z.string().or(z.date()).optional(),
      tags: z.array(z.string()).optional(),
      category: z.string().optional(),
      image: z.string().optional(),
      ogImage: z.string().optional(),
      canonical: z.string().optional(),
      schema: z.string().optional(),
      readingTime: z.string().optional(),
      draft: z.boolean().optional(),
      featured: z.boolean().optional(),
    }),
  }
});

export default defineConfig();
