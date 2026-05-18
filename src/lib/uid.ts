import { z, ZodError } from 'zod';
import { ApiError } from '@/lib/auth-guards';

export function generateUid(): string {
  return crypto.randomUUID();
}

export const uidSchema = z.string().uuid();

export function parseUid(value: unknown): string {
  return uidSchema.parse(value);
}

/**
 * Parse and validate a generation uid from a route param string.
 * Throws ApiError(400) if invalid, re-throws any other error.
 */
export function parseGenerationUid(id: string): string {
  try {
    return parseUid(id);
  } catch (err) {
    if (err instanceof ZodError) throw new ApiError(400, 'validation', 'Generation id must be a UUID');
    throw err;
  }
}
