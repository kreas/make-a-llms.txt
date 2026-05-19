import { z } from 'zod';

export const runCitationAuditBodySchema = z.object({
  pageUrl: z.string().url(),
}).strict();

export const listCitationAuditsQuerySchema = z.object({
  pageUrl: z.string().url(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(10),
  cursor: z.string().optional(),
});

export type RunCitationAuditBody = z.infer<typeof runCitationAuditBodySchema>;
export type ListCitationAuditsQuery = z.infer<typeof listCitationAuditsQuerySchema>;
