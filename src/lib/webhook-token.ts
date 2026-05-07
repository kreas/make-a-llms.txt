import { createHash, timingSafeEqual } from 'node:crypto';
import { nanoid } from 'nanoid';

export type WebhookTokenParts = {
  token: string;
  hash: string;
  prefix: string;
};

export function createWebhookToken(): WebhookTokenParts {
  const token = `lmt_${nanoid(32)}`;
  const hash = hashToken(token);
  const prefix = token.slice(0, 8);
  return { token, hash, prefix };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function verifyToken(presented: string, storedHash: string): boolean {
  const presentedHash = hashToken(presented);
  if (presentedHash.length !== storedHash.length) return false;
  return timingSafeEqual(Buffer.from(presentedHash), Buffer.from(storedHash));
}
