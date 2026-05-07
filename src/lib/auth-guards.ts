import { eq, and } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { getDb } from '@/db';
import { sites, generations, type Site, type Generation } from '@/db/schema';
import { getCurrentUser } from '@/lib/auth';

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

export async function assertOwnsSite(siteId: number, userId: number): Promise<Site> {
  const [row] = await getDb()
    .select()
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.userId, userId)));
  if (!row) throw new ApiError(404, 'not_found', 'Site not found');
  return row;
}

export async function assertOwnsGeneration(
  generationId: number,
  userId: number,
): Promise<Generation> {
  const [row] = await getDb()
    .select()
    .from(generations)
    .where(and(eq(generations.id, generationId), eq(generations.userId, userId)));
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
