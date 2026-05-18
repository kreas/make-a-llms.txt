import { z } from 'zod';

export function generateUid(): string {
  return crypto.randomUUID();
}

export const uidSchema = z.string().uuid();

export function parseUid(value: unknown): string {
  return uidSchema.parse(value);
}
