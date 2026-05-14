import { eq, desc } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db';
import { apiTokens } from '@/db/schema';
import { ApiError, apiErrorResponse, requireUserOrThrow } from '@/lib/auth-guards';
import { createApiToken } from '@/lib/tokens/api-token';

const createSchema = z.object({
  name: z.string().min(1).max(80),
  expiresInDays: z.number().int().positive().max(3650).optional(),
});

export async function GET() {
  try {
    const user = await requireUserOrThrow();
    const rows = await getDb()
      .select({
        id: apiTokens.id,
        name: apiTokens.name,
        tokenPrefix: apiTokens.tokenPrefix,
        lastUsedAt: apiTokens.lastUsedAt,
        expiresAt: apiTokens.expiresAt,
        revokedAt: apiTokens.revokedAt,
        createdAt: apiTokens.createdAt,
      })
      .from(apiTokens)
      .where(eq(apiTokens.userId, user.id))
      .orderBy(desc(apiTokens.createdAt));
    return Response.json({ tokens: rows });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUserOrThrow();
    const parsed = createSchema.safeParse(await req.json());
    if (!parsed.success) {
      throw new ApiError(400, 'validation', parsed.error.message);
    }
    const { name, expiresInDays } = parsed.data;
    const { token, hash, prefix } = createApiToken();
    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 86_400_000).toISOString()
      : null;
    const [record] = await getDb()
      .insert(apiTokens)
      .values({
        userId: user.id,
        name,
        tokenHash: hash,
        tokenPrefix: prefix,
        expiresAt,
      })
      .returning({
        id: apiTokens.id,
        name: apiTokens.name,
        tokenPrefix: apiTokens.tokenPrefix,
        expiresAt: apiTokens.expiresAt,
        createdAt: apiTokens.createdAt,
      });
    return Response.json({ token, record }, { status: 201 });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
