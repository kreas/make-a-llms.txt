import { timingSafeEqual } from 'node:crypto';
import { generateTokenSecret, hashTokenSecret, tokenPrefix } from './index';

export const API_TOKEN_PREFIX = 'mklt_pat_';

export type ApiTokenParts = {
  token: string;
  hash: string;
  prefix: string;
};

export function createApiToken(): ApiTokenParts {
  const token = `${API_TOKEN_PREFIX}${generateTokenSecret(32)}`;
  return {
    token,
    hash: hashTokenSecret(token),
    prefix: tokenPrefix(token, 12),
  };
}

export function verifyApiToken(presented: string, storedHash: string): boolean {
  if (!presented.startsWith(API_TOKEN_PREFIX)) return false;
  const a = Buffer.from(hashTokenSecret(presented));
  const b = Buffer.from(storedHash);
  if (a.byteLength !== b.byteLength) return false;
  return timingSafeEqual(a, b);
}
