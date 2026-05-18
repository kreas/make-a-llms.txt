import type { ApiToken } from '@/db/schema';
import type { ApiTokenPublic } from '@/lib/types/public';

export function toPublicApiToken(t: ApiToken): ApiTokenPublic {
  return {
    id: t.uid,
    name: t.name,
    tokenPrefix: t.tokenPrefix,
    lastUsedAt: t.lastUsedAt,
    expiresAt: t.expiresAt,
    revokedAt: t.revokedAt,
    createdAt: t.createdAt,
  };
}
