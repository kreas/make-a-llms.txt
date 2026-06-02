import { z } from 'zod';

export const runGeoAuditBodySchema = z.object({
  siteType: z.enum(['saas', 'ecommerce', 'local', 'publisher', 'services', 'other']),
  goal: z.enum(['get-cited', 'win-comparisons', 'build-trust']),
}).strict();

export type RunGeoAuditBody = z.infer<typeof runGeoAuditBodySchema>;
