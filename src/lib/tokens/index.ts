import { createHash, randomBytes } from 'node:crypto';

export function generateTokenSecret(byteLength = 32): string {
  return randomBytes(byteLength).toString('base64url');
}

export function hashTokenSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('base64url');
}

export function tokenPrefix(token: string, length = 12): string {
  return token.slice(0, length);
}
