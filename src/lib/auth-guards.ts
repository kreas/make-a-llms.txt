import { eq, and } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { getDb } from '@/db';
import { sites, generations, apiTokens, users, type Site, type Generation, type User } from '@/db/schema';
import { getCurrentUser } from '@/lib/auth';
import { hashTokenSecret } from '@/lib/tokens';
import { API_TOKEN_PREFIX } from '@/lib/tokens/api-token';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Server-component guard: redirects to /signin if unauthenticated. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/signin');
  }
  return user;
}

/** API-route guard: throws ApiError(401) if unauthenticated. */
export async function requireUserOrThrow() {
  const user = await getCurrentUser();
  if (!user) throw new ApiError(401, 'unauthenticated', 'Sign in required');
  return user;
}

export async function assertOwnsSiteByUid(siteUid: string, userId: number): Promise<Site> {
  const [row] = await getDb()
    .select()
    .from(sites)
    .where(and(eq(sites.uid, siteUid), eq(sites.userId, userId)));
  if (!row) throw new ApiError(404, 'not_found', 'Site not found');
  return row;
}

export async function assertOwnsGenerationByUid(
  generationUid: string,
  userId: number,
): Promise<Generation> {
  const [row] = await getDb()
    .select()
    .from(generations)
    .where(and(eq(generations.uid, generationUid), eq(generations.userId, userId)));
  if (!row) throw new ApiError(404, 'not_found', 'Generation not found');
  return row;
}

export function apiErrorResponse(err: unknown): Response {
  if (err instanceof ApiError) {
    return new Response(
      JSON.stringify({ error: { code: err.code, message: err.message } }),
      { status: err.status, headers: { 'content-type': 'application/json' } },
    );
  }
  console.error('[api] unhandled error', err);
  return new Response(
    JSON.stringify({ error: { code: 'internal', message: 'Internal Server Error' } }),
    { status: 500, headers: { 'content-type': 'application/json' } },
  );
}

export async function requireApiTokenOrThrow(req: Request): Promise<User> {
  const fail = () =>
    new ApiError(401, 'unauthenticated', 'Invalid or missing API token');

  const header = req.headers.get('authorization') ?? '';
  const match = header.match(/^Bearer\s+(\S+)$/i);
  if (!match) throw fail();
  const raw = match[1];
  if (!raw.startsWith(API_TOKEN_PREFIX)) throw fail();

  const hash = hashTokenSecret(raw);
  const db = getDb();
  let row: (typeof apiTokens.$inferSelect) | undefined;
  try {
    [row] = await db.select().from(apiTokens).where(eq(apiTokens.tokenHash, hash));
  } catch {
    throw fail();
  }
  if (!row) throw fail();
  if (row.revokedAt) throw fail();
  if (row.expiresAt && new Date(row.expiresAt).getTime() <= Date.now()) throw fail();

  let user: (typeof users.$inferSelect) | undefined;
  try {
    [user] = await db.select().from(users).where(eq(users.id, row.userId));
  } catch {
    throw fail();
  }
  if (!user) throw fail();

  // Fire-and-forget: do not await, do not throw.
  void db
    .update(apiTokens)
    .set({ lastUsedAt: new Date().toISOString() })
    .where(eq(apiTokens.id, row.id))
    .catch(() => {});

  return user;
}
