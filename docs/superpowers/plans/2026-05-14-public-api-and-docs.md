# Public API + Docs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a versioned, PAT-authed `/api/v1/*` API exposing generation creation/polling/artifact retrieval, plus a fumadocs `/docs` site combining MDX guides with an OpenAPI reference generated from Zod schemas.

**Architecture:** New tokens table, new `requireApiTokenOrThrow` guard, a shared service layer extracted from existing internal routes, six v1 route handlers, an OpenAPI document built at `pnpm build` time from the same Zod schemas the handlers use, and a fumadocs site at `/docs` that consumes `public/openapi.json`. Internal routes keep working unchanged.

**Tech Stack:** Next.js 16 App Router, Drizzle + Turso, Zod v4, `zod-openapi`, `fumadocs-core` / `fumadocs-ui` / `fumadocs-openapi`, Vitest + RTL, TanStack Query.

**Spec:** `docs/superpowers/specs/2026-05-14-public-api-and-docs-design.md`

---

## File Structure (locked in)

**Created:**
- `src/lib/tokens/index.ts` — generic primitives (random secret, hash, prefix)
- `src/lib/tokens/index.test.ts`
- `src/lib/tokens/api-token.ts` — `createApiToken`, `verifyApiToken`
- `src/lib/tokens/api-token.test.ts`
- `src/lib/services/generations.ts` — shared `GenerationView`, file/manifest/page readers
- `src/lib/services/generations.test.ts`
- `src/lib/openapi/schemas.ts` — Zod request/response schemas with `.openapi()` metadata
- `src/lib/openapi/schemas.test.ts`
- `src/lib/openapi/routes.ts` — route descriptors binding schemas to (method, path)
- `src/lib/openapi/document.ts` — `buildOpenApiDocument()`
- `src/lib/openapi/document.test.ts` — drift canary
- `scripts/build-openapi.ts` — Node script writing `public/openapi.json`
- `src/app/api/api-tokens/route.ts` — internal cookie-authed GET / POST
- `src/app/api/api-tokens/route.test.ts`
- `src/app/api/api-tokens/[id]/route.ts` — internal cookie-authed DELETE
- `src/app/api/api-tokens/[id]/route.test.ts`
- `src/app/api/v1/generations/route.ts` — POST kick off
- `src/app/api/v1/generations/route.test.ts`
- `src/app/api/v1/generations/[id]/route.ts` — GET curated status
- `src/app/api/v1/generations/[id]/route.test.ts`
- `src/app/api/v1/generations/[id]/llms.txt/route.ts`
- `src/app/api/v1/generations/[id]/llms.txt/route.test.ts`
- `src/app/api/v1/generations/[id]/llms-full.txt/route.ts`
- `src/app/api/v1/generations/[id]/llms-full.txt/route.test.ts`
- `src/app/api/v1/generations/[id]/pages/route.ts`
- `src/app/api/v1/generations/[id]/pages/route.test.ts`
- `src/app/api/v1/generations/[id]/pages/[...path]/route.ts`
- `src/app/api/v1/generations/[id]/pages/[...path]/route.test.ts`
- `src/app/(app)/settings/api-tokens/page.tsx`
- `src/app/(app)/settings/api-tokens/api-tokens-client.tsx`
- `src/app/(app)/settings/api-tokens/api-tokens-client.test.tsx`
- `src/app/(app)/settings/api-tokens/create-token-dialog.tsx`
- `src/app/(app)/settings/api-tokens/create-token-dialog.test.tsx`
- `src/app/docs/layout.tsx`
- `src/app/docs/[[...slug]]/page.tsx`
- `src/app/docs/api/[[...slug]]/page.tsx`
- `src/lib/docs/source.ts`
- `src/lib/docs/openapi.ts`
- `content/docs/index.mdx`
- `content/docs/authentication.mdx`
- `content/docs/quickstart.mdx`
- `content/docs/meta.json`
- `source.config.ts` (repo root)
- `drizzle/0007_<name>.sql` (drizzle-generated)
- `docs/superpowers/plans/2026-05-14-public-api-and-docs.md` (this file)

**Modified:**
- `src/db/schema.ts` — add `apiTokens` table + types
- `src/lib/webhook-token.ts` — re-export-only; logic moves to tokens module (interface unchanged for existing callers)
- `src/lib/auth-guards.ts` — add `requireApiTokenOrThrow`
- `src/app/api/generations/route.ts` — POST handler becomes thin (inline-site-create stays here for now; GET becomes service-backed)
- `src/app/api/generations/[id]/route.ts` — replace body with service call
- `src/app/api/generations/[id]/files/[kind]/route.ts` — replace body with service call
- `src/app/api/generations/[id]/pages/route.ts` — replace body with service call
- `src/app/api/generations/[id]/pages/[...path]/route.ts` — replace body with service call
- `src/components/layout/site-header.tsx` — add `/docs` nav link
- `package.json` — add `build:openapi` script and chain into `build`; new deps
- `.gitignore` — add `public/openapi.json`
- `README.md` — short pointer at `/docs`

---

## Conventions Used Throughout the Plan

- **Tests live next to source.** `foo.ts` → `foo.test.ts`.
- **All tests run via** `pnpm test` (Vitest). One-off run: `pnpm test path/to/file.test.ts`.
- **DB tests** use `setupTestDb()` from `@/test/db` — spins up an in-memory libsql instance and runs migrations.
- **Auth mocking** in route tests follows the existing pattern: `vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }))` and `vi.mocked(getCurrentUser).mockResolvedValue(user)`.
- **Commit cadence:** one commit per task, message format `<type>(<scope>): <subject>` matching recent history (`feat(workflow): ...`, `docs(specs): ...`, etc.).
- **No emojis** in code, commits, or docs unless specifically requested.

---

## Task 1 — `api_tokens` table + migration

**Files:**
- Modify: `src/db/schema.ts`
- Create: `drizzle/0007_<generated-name>.sql`

- [ ] **Step 1: Add the schema definition**

Append to `src/db/schema.ts` (after the existing tables, before re-exports):

```ts
export const apiTokens = sqliteTable(
  'api_tokens',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    tokenPrefix: text('token_prefix').notNull(),
    lastUsedAt: text('last_used_at'),
    expiresAt: text('expires_at'),
    revokedAt: text('revoked_at'),
    createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
  },
  (t) => ({
    byUser: index('api_tokens_by_user').on(t.userId),
  }),
);

export type ApiToken = typeof apiTokens.$inferSelect;
export type NewApiToken = typeof apiTokens.$inferInsert;
```

- [ ] **Step 2: Generate the migration**

Run:
```bash
pnpm db:generate
```

Expected: a new file appears at `drizzle/0007_<drizzle-name>.sql` containing `CREATE TABLE api_tokens` and `CREATE INDEX api_tokens_by_user`. `drizzle/meta/_journal.json` is updated.

- [ ] **Step 3: Verify tests still pass**

Run:
```bash
pnpm test src/db
```

Expected: all existing tests pass. (No new test yet — schema is used in later tasks.)

- [ ] **Step 4: Commit**

```bash
git add src/db/schema.ts drizzle/0007_*.sql drizzle/meta/
git commit -m "feat(db): add api_tokens table"
```

---

## Task 2 — Generic token primitives

**Files:**
- Create: `src/lib/tokens/index.ts`
- Create: `src/lib/tokens/index.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/tokens/index.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { generateTokenSecret, hashTokenSecret, tokenPrefix } from './index';

describe('generateTokenSecret', () => {
  it('returns base64url string of expected length', () => {
    const s = generateTokenSecret(32);
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(s.length).toBeGreaterThanOrEqual(40);
  });

  it('returns distinct values on repeated calls', () => {
    expect(generateTokenSecret()).not.toBe(generateTokenSecret());
  });
});

describe('hashTokenSecret', () => {
  it('is deterministic', () => {
    expect(hashTokenSecret('abc')).toBe(hashTokenSecret('abc'));
  });

  it('produces base64url sha256 (43-44 chars)', () => {
    const h = hashTokenSecret('abc');
    expect(h).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(h.length).toBeGreaterThanOrEqual(43);
  });
});

describe('tokenPrefix', () => {
  it('returns the first N characters', () => {
    expect(tokenPrefix('abcdefghij', 5)).toBe('abcde');
  });

  it('defaults to 12 characters', () => {
    expect(tokenPrefix('a'.repeat(40))).toBe('a'.repeat(12));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/tokens/index.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/lib/tokens/index.ts`:

```ts
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
```

- [ ] **Step 4: Run test**

Run: `pnpm test src/lib/tokens/index.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tokens/index.ts src/lib/tokens/index.test.ts
git commit -m "feat(tokens): add generic token primitives"
```

---

## Task 3 — API token helpers

**Files:**
- Create: `src/lib/tokens/api-token.ts`
- Create: `src/lib/tokens/api-token.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/tokens/api-token.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createApiToken, verifyApiToken, API_TOKEN_PREFIX } from './api-token';

describe('createApiToken', () => {
  it('returns token, hash, and prefix', () => {
    const t = createApiToken();
    expect(t.token.startsWith(API_TOKEN_PREFIX)).toBe(true);
    expect(t.token.length).toBeGreaterThanOrEqual(API_TOKEN_PREFIX.length + 40);
    expect(t.hash.length).toBeGreaterThanOrEqual(43);
    expect(t.prefix.length).toBe(12);
    expect(t.token.startsWith(t.prefix)).toBe(true);
  });

  it('returns distinct tokens on repeated calls', () => {
    expect(createApiToken().token).not.toBe(createApiToken().token);
  });
});

describe('verifyApiToken', () => {
  it('returns true for matching hash', () => {
    const { token, hash } = createApiToken();
    expect(verifyApiToken(token, hash)).toBe(true);
  });

  it('returns false for non-matching hash', () => {
    const { hash } = createApiToken();
    expect(verifyApiToken('mklt_pat_wrong', hash)).toBe(false);
  });

  it('returns false for tokens missing the prefix', () => {
    const { hash } = createApiToken();
    expect(verifyApiToken('not-a-token', hash)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/tokens/api-token.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/lib/tokens/api-token.ts`:

```ts
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
  return hashTokenSecret(presented) === storedHash;
}
```

- [ ] **Step 4: Run test**

Run: `pnpm test src/lib/tokens/api-token.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tokens/api-token.ts src/lib/tokens/api-token.test.ts
git commit -m "feat(tokens): add API personal access token helpers"
```

---

## Task 4 — `requireApiTokenOrThrow` guard

**Files:**
- Modify: `src/lib/auth-guards.ts`
- Modify: `src/lib/auth-guards.test.ts` (create if missing)

- [ ] **Step 1: Write the failing test**

Append to (or create) `src/lib/auth-guards.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { users, apiTokens } from '@/db/schema';
import { createApiToken } from '@/lib/tokens/api-token';
import { requireApiTokenOrThrow, ApiError } from './auth-guards';

function req(headers: Record<string, string> = {}) {
  return new Request('http://t/api/v1/x', { headers });
}

describe('requireApiTokenOrThrow', () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  it('throws 401 when Authorization header is missing', async () => {
    await expect(requireApiTokenOrThrow(req())).rejects.toThrow(ApiError);
  });

  it('throws 401 for malformed Authorization header', async () => {
    await expect(
      requireApiTokenOrThrow(req({ authorization: 'Bearer not-a-token' })),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('throws 401 for unknown token hash', async () => {
    const { token } = createApiToken();
    await expect(
      requireApiTokenOrThrow(req({ authorization: `Bearer ${token}` })),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('returns the user for a valid token', async () => {
    const db = getDb();
    const [u] = await db.insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
    const { token, hash, prefix } = createApiToken();
    await db.insert(apiTokens).values({
      userId: u.id,
      name: 'CI',
      tokenHash: hash,
      tokenPrefix: prefix,
    });
    const out = await requireApiTokenOrThrow(req({ authorization: `Bearer ${token}` }));
    expect(out.id).toBe(u.id);
  });

  it('throws 401 for revoked tokens', async () => {
    const db = getDb();
    const [u] = await db.insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
    const { token, hash, prefix } = createApiToken();
    await db.insert(apiTokens).values({
      userId: u.id,
      name: 'old',
      tokenHash: hash,
      tokenPrefix: prefix,
      revokedAt: new Date().toISOString(),
    });
    await expect(
      requireApiTokenOrThrow(req({ authorization: `Bearer ${token}` })),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('throws 401 for expired tokens', async () => {
    const db = getDb();
    const [u] = await db.insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
    const { token, hash, prefix } = createApiToken();
    const pastIso = new Date(Date.now() - 60_000).toISOString();
    await db.insert(apiTokens).values({
      userId: u.id,
      name: 'expired',
      tokenHash: hash,
      tokenPrefix: prefix,
      expiresAt: pastIso,
    });
    await expect(
      requireApiTokenOrThrow(req({ authorization: `Bearer ${token}` })),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('updates lastUsedAt for valid tokens', async () => {
    const db = getDb();
    const [u] = await db.insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
    const { token, hash, prefix } = createApiToken();
    const [t] = await db
      .insert(apiTokens)
      .values({ userId: u.id, name: 'CI', tokenHash: hash, tokenPrefix: prefix })
      .returning();
    await requireApiTokenOrThrow(req({ authorization: `Bearer ${token}` }));
    // Allow the fire-and-forget update to settle.
    await new Promise((r) => setTimeout(r, 20));
    const [reloaded] = await db.select().from(apiTokens).where(eq(apiTokens.id, t.id));
    expect(reloaded.lastUsedAt).toBeTruthy();
  });
});
```

(Add `import { eq } from 'drizzle-orm';` at the top.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/auth-guards.test.ts`
Expected: FAIL — `requireApiTokenOrThrow is not a function`.

- [ ] **Step 3: Implement**

Append to `src/lib/auth-guards.ts`:

```ts
import { apiTokens, type User } from '@/db/schema'; // adjust existing imports
import { hashTokenSecret } from '@/lib/tokens';
import { API_TOKEN_PREFIX } from '@/lib/tokens/api-token';

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
  const [row] = await db.select().from(apiTokens).where(eq(apiTokens.tokenHash, hash));
  if (!row) throw fail();
  if (row.revokedAt) throw fail();
  if (row.expiresAt && new Date(row.expiresAt).getTime() <= Date.now()) throw fail();

  const [user] = await db.select().from(users).where(eq(users.id, row.userId));
  if (!user) throw fail();

  // Fire-and-forget: do not await, do not throw.
  void db
    .update(apiTokens)
    .set({ lastUsedAt: new Date().toISOString() })
    .where(eq(apiTokens.id, row.id))
    .catch(() => {});

  return user;
}
```

Ensure `User`, `users`, `apiTokens` are imported from `@/db/schema` and `eq` from `drizzle-orm`. Add a `User` type export to `schema.ts` if not present:

```ts
export type User = typeof users.$inferSelect;
```

- [ ] **Step 4: Run test**

Run: `pnpm test src/lib/auth-guards.test.ts`
Expected: PASS (all 7 cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth-guards.ts src/lib/auth-guards.test.ts src/db/schema.ts
git commit -m "feat(auth): add requireApiTokenOrThrow guard"
```

---

## Task 5 — Internal API endpoints for PAT management

**Files:**
- Create: `src/app/api/api-tokens/route.ts`
- Create: `src/app/api/api-tokens/route.test.ts`
- Create: `src/app/api/api-tokens/[id]/route.ts`
- Create: `src/app/api/api-tokens/[id]/route.test.ts`

- [ ] **Step 1: Write the failing test for list+create**

`src/app/api/api-tokens/route.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { users, apiTokens } from '@/db/schema';

vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }));

import { GET, POST } from './route';
import { getCurrentUser } from '@/lib/auth';

function jsonReq(body: unknown) {
  return new Request('http://t/api/api-tokens', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/api-tokens', () => {
  beforeEach(async () => {
    await setupTestDb();
    const db = getDb();
    const [u] = await db.insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
    vi.mocked(getCurrentUser).mockResolvedValue(u);
  });

  it('creates a token and returns the raw token exactly once', async () => {
    const res = await POST(jsonReq({ name: 'CI' }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.token).toMatch(/^mklt_pat_/);
    expect(body.record.name).toBe('CI');
    expect(body.record.tokenPrefix.length).toBe(12);
  });

  it('honors expiresInDays', async () => {
    const res = await POST(jsonReq({ name: 'CI', expiresInDays: 30 }));
    const body = await res.json();
    expect(body.record.expiresAt).toBeTruthy();
  });

  it('400 on missing name', async () => {
    const res = await POST(jsonReq({}));
    expect(res.status).toBe(400);
  });

  it('401 when not signed in', async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(null);
    const res = await POST(jsonReq({ name: 'CI' }));
    expect(res.status).toBe(401);
  });
});

describe('GET /api/api-tokens', () => {
  it('lists current user tokens without the raw token', async () => {
    await setupTestDb();
    const db = getDb();
    const [u] = await db.insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
    vi.mocked(getCurrentUser).mockResolvedValue(u);
    await db.insert(apiTokens).values({
      userId: u.id,
      name: 'one',
      tokenHash: 'h'.repeat(43),
      tokenPrefix: 'mklt_pat_xx',
    });
    const res = await GET();
    const body = await res.json();
    expect(body.tokens).toHaveLength(1);
    expect(body.tokens[0]).not.toHaveProperty('tokenHash');
    expect(body.tokens[0]).not.toHaveProperty('token');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/app/api/api-tokens/route.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement list+create**

`src/app/api/api-tokens/route.ts`:

```ts
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
```

- [ ] **Step 4: Run test**

Run: `pnpm test src/app/api/api-tokens/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing test for DELETE**

`src/app/api/api-tokens/[id]/route.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { users, apiTokens } from '@/db/schema';
import { eq } from 'drizzle-orm';

vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }));

import { DELETE } from './route';
import { getCurrentUser } from '@/lib/auth';

describe('DELETE /api/api-tokens/[id]', () => {
  let userId: number;
  let tokenId: number;

  beforeEach(async () => {
    await setupTestDb();
    const db = getDb();
    const [u] = await db.insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
    userId = u.id;
    const [t] = await db
      .insert(apiTokens)
      .values({ userId, name: 'x', tokenHash: 'h'.repeat(43), tokenPrefix: 'mklt_pat_xx' })
      .returning();
    tokenId = t.id;
    vi.mocked(getCurrentUser).mockResolvedValue(u);
  });

  it('sets revokedAt on the token', async () => {
    const ctx = { params: Promise.resolve({ id: String(tokenId) }) };
    const res = await DELETE(new Request('http://t', { method: 'DELETE' }), ctx);
    expect(res.status).toBe(200);
    const [reloaded] = await getDb().select().from(apiTokens).where(eq(apiTokens.id, tokenId));
    expect(reloaded.revokedAt).toBeTruthy();
  });

  it('404 when token is not owned', async () => {
    const db = getDb();
    const [other] = await db.insert(users).values({ name: 'O', email: 'o@o.test' }).returning();
    vi.mocked(getCurrentUser).mockResolvedValue(other);
    const ctx = { params: Promise.resolve({ id: String(tokenId) }) };
    const res = await DELETE(new Request('http://t', { method: 'DELETE' }), ctx);
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm test src/app/api/api-tokens/\[id\]/route.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement DELETE**

`src/app/api/api-tokens/[id]/route.ts`:

```ts
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { apiTokens } from '@/db/schema';
import { ApiError, apiErrorResponse, requireUserOrThrow } from '@/lib/auth-guards';

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUserOrThrow();
    const { id } = await ctx.params;
    const n = Number(id);
    if (!Number.isInteger(n) || n <= 0) {
      throw new ApiError(404, 'not_found', 'Token not found');
    }
    const [row] = await getDb()
      .select()
      .from(apiTokens)
      .where(and(eq(apiTokens.id, n), eq(apiTokens.userId, user.id)));
    if (!row) throw new ApiError(404, 'not_found', 'Token not found');
    if (!row.revokedAt) {
      await getDb()
        .update(apiTokens)
        .set({ revokedAt: new Date().toISOString() })
        .where(eq(apiTokens.id, n));
    }
    return Response.json({ ok: true });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
```

- [ ] **Step 8: Run test**

Run: `pnpm test src/app/api/api-tokens`
Expected: PASS for all tests in both route files.

- [ ] **Step 9: Commit**

```bash
git add src/app/api/api-tokens/
git commit -m "feat(api): add internal endpoints for API token management"
```

---

## Task 6 — PAT management UI

**Files:**
- Create: `src/app/(app)/settings/api-tokens/page.tsx`
- Create: `src/app/(app)/settings/api-tokens/api-tokens-client.tsx`
- Create: `src/app/(app)/settings/api-tokens/api-tokens-client.test.tsx`
- Create: `src/app/(app)/settings/api-tokens/create-token-dialog.tsx`
- Create: `src/app/(app)/settings/api-tokens/create-token-dialog.test.tsx`

**React notes (apply to all components in this task):**
- Use `'use client'` only on `api-tokens-client.tsx` and `create-token-dialog.tsx`. `page.tsx` stays a server component.
- TanStack Query is already wired in `src/components/providers.tsx`.
- Conditional rendering: use ternary, not `&&` (project pattern).
- No inline component definitions inside other components.

- [ ] **Step 1: Server-component page skeleton**

`src/app/(app)/settings/api-tokens/page.tsx`:

```tsx
import { requireUser } from '@/lib/auth-guards';
import { ApiTokensClient } from './api-tokens-client';

export default async function ApiTokensPage() {
  await requireUser();
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <header>
        <h1 className="display-lg text-ink">API tokens</h1>
        <p className="mt-2 text-base text-muted-strong">
          Create personal access tokens to use the public API.
        </p>
      </header>
      <ApiTokensClient />
    </div>
  );
}
```

- [ ] **Step 2: Write the failing test for the client**

`src/app/(app)/settings/api-tokens/api-tokens-client.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiTokensClient } from './api-tokens-client';

function withQuery(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

describe('ApiTokensClient', () => {
  it('renders a row for each token', async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        tokens: [
          { id: 1, name: 'CI', tokenPrefix: 'mklt_pat_abc', lastUsedAt: null, revokedAt: null, expiresAt: null, createdAt: '' },
        ],
      }),
    });
    render(withQuery(<ApiTokensClient />));
    expect(await screen.findByText('CI')).toBeInTheDocument();
    expect(screen.getByText(/mklt_pat_abc/)).toBeInTheDocument();
  });

  it('revokes a token after confirm', async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        tokens: [
          { id: 1, name: 'CI', tokenPrefix: 'mklt_pat_abc', lastUsedAt: null, revokedAt: null, expiresAt: null, createdAt: '' },
        ],
      }),
    });
    (fetch as any).mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    (fetch as any).mockResolvedValueOnce({ ok: true, json: async () => ({ tokens: [] }) });
    render(withQuery(<ApiTokensClient />));
    await screen.findByText('CI');
    await userEvent.click(screen.getByRole('button', { name: /revoke/i }));
    await userEvent.click(screen.getByRole('button', { name: /confirm/i }));
    await waitFor(() => {
      expect((fetch as any).mock.calls[1][0]).toBe('/api/api-tokens/1');
    });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test src/app/\(app\)/settings/api-tokens/api-tokens-client.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the client**

`src/app/(app)/settings/api-tokens/api-tokens-client.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { CreateTokenDialog } from './create-token-dialog';

type TokenRow = {
  id: number;
  name: string;
  tokenPrefix: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

export function ApiTokensClient() {
  const [creating, setCreating] = useState(false);
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const qc = useQueryClient();

  const tokensQuery = useQuery({
    queryKey: ['api-tokens'],
    queryFn: async () => {
      const r = await fetch('/api/api-tokens');
      if (!r.ok) throw new Error('failed');
      return (await r.json()) as { tokens: TokenRow[] };
    },
  });

  const revoke = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/api-tokens/${id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error('failed');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-tokens'] }),
  });

  const tokens = tokensQuery.data?.tokens ?? [];

  return (
    <section className="rounded-lg border border-hairline bg-surface-card p-8">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ink">Tokens</h2>
        <Button onClick={() => setCreating(true)}>New token</Button>
      </div>
      {tokens.length === 0 ? (
        <p className="mt-4 text-sm text-muted-strong">No tokens yet.</p>
      ) : (
        <ul className="mt-6 divide-y divide-hairline">
          {tokens.map((t) => (
            <li key={t.id} className="flex items-center justify-between py-3">
              <div>
                <div className="text-ink">{t.name}</div>
                <div className="font-mono text-xs text-muted-strong">{t.tokenPrefix}…</div>
              </div>
              {t.revokedAt ? (
                <span className="text-xs text-muted-strong">Revoked</span>
              ) : confirmingId === t.id ? (
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => setConfirmingId(null)}>Cancel</Button>
                  <Button
                    onClick={() => {
                      revoke.mutate(t.id);
                      setConfirmingId(null);
                    }}
                  >
                    Confirm
                  </Button>
                </div>
              ) : (
                <Button variant="ghost" onClick={() => setConfirmingId(t.id)}>Revoke</Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <CreateTokenDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={() => qc.invalidateQueries({ queryKey: ['api-tokens'] })}
      />
    </section>
  );
}
```

- [ ] **Step 5: Write the failing test for the dialog**

`src/app/(app)/settings/api-tokens/create-token-dialog.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreateTokenDialog } from './create-token-dialog';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

describe('CreateTokenDialog', () => {
  it('shows the raw token exactly once after create', async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        token: 'mklt_pat_secret123',
        record: { id: 1, name: 'CI', tokenPrefix: 'mklt_pat_se', createdAt: '', expiresAt: null },
      }),
    });
    const onCreated = vi.fn();
    render(<CreateTokenDialog open onClose={() => {}} onCreated={onCreated} />);
    await userEvent.type(screen.getByLabelText(/name/i), 'CI');
    await userEvent.click(screen.getByRole('button', { name: /create/i }));
    expect(await screen.findByText('mklt_pat_secret123')).toBeInTheDocument();
    expect(onCreated).toHaveBeenCalled();
  });

  it('disables Create when name is empty', () => {
    render(<CreateTokenDialog open onClose={() => {}} onCreated={() => {}} />);
    expect(screen.getByRole('button', { name: /create/i })).toBeDisabled();
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm test src/app/\(app\)/settings/api-tokens/create-token-dialog.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement the dialog**

`src/app/(app)/settings/api-tokens/create-token-dialog.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

const EXPIRY_OPTIONS = [
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
  { label: '365 days', days: 365 },
  { label: 'Never', days: null },
] as const;

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
};

export function CreateTokenDialog({ open, onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [days, setDays] = useState<number | null>(90);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const handleCreate = async () => {
    setSubmitting(true);
    try {
      const r = await fetch('/api/api-tokens', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, expiresInDays: days ?? undefined }),
      });
      if (!r.ok) return;
      const body = await r.json();
      setCreatedToken(body.token);
      onCreated();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg border border-hairline bg-surface-card p-6">
        {createdToken ? (
          <div>
            <h3 className="text-lg font-semibold text-ink">Token created</h3>
            <p className="mt-2 text-sm text-muted-strong">
              Copy this now — you won&apos;t see it again.
            </p>
            <pre className="mt-4 overflow-x-auto rounded bg-canvas-soft p-3 font-mono text-sm">
              {createdToken}
            </pre>
            <div className="mt-6 flex justify-end">
              <Button
                onClick={() => {
                  setCreatedToken(null);
                  setName('');
                  onClose();
                }}
              >
                Done
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <h3 className="text-lg font-semibold text-ink">New API token</h3>
            <label className="mt-4 block text-sm text-ink">
              Name
              <input
                className="mt-1 w-full rounded border border-hairline bg-canvas px-3 py-2"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="mt-4 block text-sm text-ink">
              Expires
              <select
                className="mt-1 w-full rounded border border-hairline bg-canvas px-3 py-2"
                value={days ?? ''}
                onChange={(e) => setDays(e.target.value ? Number(e.target.value) : null)}
              >
                {EXPIRY_OPTIONS.map((o) => (
                  <option key={o.label} value={o.days ?? ''}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
              <Button onClick={handleCreate} disabled={!name || submitting}>
                Create
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Run all tests in this task**

Run: `pnpm test src/app/\(app\)/settings/api-tokens`
Expected: PASS.

- [ ] **Step 9: Add a link from the user/account area**

There is no settings hub yet. Add a "Settings → API tokens" link to `src/components/layout/site-header.tsx`'s `NAV_ITEMS`:

```ts
const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/sites/new', label: 'Add Site' },
  { href: '/documentation', label: 'Documentation' },
  { href: '/settings/api-tokens', label: 'API Tokens' },
] as const;
```

- [ ] **Step 10: Run header tests**

Run: `pnpm test src/components/layout/site-header.test.tsx`
Expected: PASS (the test asserts links exist by `href`; adding one extra is non-breaking — verify and adjust the test if it asserts exact count).

If the test asserts an exact NAV_ITEMS count, update the test to include the new entry.

- [ ] **Step 11: Commit**

```bash
git add src/app/\(app\)/settings/api-tokens src/components/layout/site-header.tsx src/components/layout/site-header.test.tsx
git commit -m "feat(settings): add API token management UI"
```

---

## Task 7 — Shared generations service layer

**Files:**
- Create: `src/lib/services/generations.ts`
- Create: `src/lib/services/generations.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/services/generations.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { users, sites, generations } from '@/db/schema';

vi.mock('@vercel/blob', () => ({
  get: vi.fn(async (path: string) => {
    if (path === 'pages/manifest.json') {
      return { stream: new Response(JSON.stringify({ pages: [{ path: 'a', blobPath: 'pages/a.md', status: 'ok', bytes: 10 }] })).body };
    }
    if (path === 'pages/a.md') {
      return { stream: new Response('# A').body };
    }
    if (path === 'llms.txt') {
      return { stream: new Response('llms here').body };
    }
    return null;
  }),
}));

import { getGenerationView, readGenerationFile, readPageManifest, readPageMarkdown } from './generations';
import { ApiError } from '@/lib/auth-guards';

async function seed() {
  await setupTestDb();
  const db = getDb();
  const [u] = await db.insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
  const [s] = await db
    .insert(sites)
    .values({ userId: u.id, name: 'S', rootUrl: 'https://s.test', webhookTokenHash: 'h'.repeat(64), webhookTokenPrefix: 'lmt_aaaa' })
    .returning();
  const [g] = await db
    .insert(generations)
    .values({
      siteId: s.id,
      userId: u.id,
      status: 'succeeded',
      trigger: 'manual',
      pagesManifestBlobPath: 'pages/manifest.json',
      llmsBlobPath: 'llms.txt',
      pagesCount: 1,
      pagesStatus: 'succeeded',
      summariesStatus: 'succeeded',
      summariesCount: 1,
    })
    .returning();
  return { user: u, gen: g };
}

describe('getGenerationView', () => {
  it('returns a curated view with file readiness flags', async () => {
    const { user, gen } = await seed();
    const v = await getGenerationView(gen.id, user.id);
    expect(v.status).toBe('succeeded');
    expect(v.files.llms.ready).toBe(true);
    expect(v.files.llmsFull.ready).toBe(false);
    expect(v.files.pages.ready).toBe(true);
    expect(v.pages.count).toBe(1);
  });

  it('throws 404 when generation is not owned', async () => {
    const { gen } = await seed();
    await expect(getGenerationView(gen.id, 9999)).rejects.toMatchObject({ status: 404 });
  });
});

describe('readGenerationFile', () => {
  it('returns a stream and filename for llms', async () => {
    const { user, gen } = await seed();
    const r = await readGenerationFile(gen.id, user.id, 'llms');
    expect(r.filename).toBe('llms.txt');
    expect(await new Response(r.stream).text()).toBe('llms here');
  });

  it('throws 404 not_ready when blob path is missing', async () => {
    const { user, gen } = await seed();
    await expect(readGenerationFile(gen.id, user.id, 'llms-full')).rejects.toMatchObject({
      status: 404,
      code: 'not_ready',
    });
  });
});

describe('readPageManifest / readPageMarkdown', () => {
  it('returns the manifest pages', async () => {
    const { user, gen } = await seed();
    const m = await readPageManifest(gen.id, user.id);
    expect(m.pages[0].path).toBe('a');
  });

  it('returns markdown for a page in the manifest', async () => {
    const { user, gen } = await seed();
    const s = await readPageMarkdown(gen.id, user.id, 'a');
    expect(await new Response(s).text()).toBe('# A');
  });

  it('throws 404 when the page is not in the manifest', async () => {
    const { user, gen } = await seed();
    await expect(readPageMarkdown(gen.id, user.id, 'missing')).rejects.toMatchObject({
      status: 404,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/services/generations.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the service**

`src/lib/services/generations.ts`:

```ts
import { get } from '@vercel/blob';
import { ApiError, assertOwnsGeneration } from '@/lib/auth-guards';
import type { Generation } from '@/db/schema';

export type GenerationStatus = Generation['status'];
export type PagesStatus = Generation['pagesStatus'];
export type SummariesStatus = Generation['summariesStatus'];

export type GenerationView = {
  id: number;
  status: GenerationStatus;
  pages: { status: PagesStatus; count: number; errorMessage?: string };
  summaries: {
    status: SummariesStatus;
    count: number;
    emptyCount: number;
    failedCount: number;
    errorMessage?: string;
  };
  files: {
    llms: { ready: boolean };
    llmsFull: { ready: boolean };
    pages: { ready: boolean };
  };
  errorMessage?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
};

export async function getGenerationView(
  generationId: number,
  userId: number,
): Promise<GenerationView> {
  const g = await assertOwnsGeneration(generationId, userId);
  return {
    id: g.id,
    status: g.status,
    pages: {
      status: g.pagesStatus,
      count: g.pagesCount,
      errorMessage: g.pagesErrorMessage ?? undefined,
    },
    summaries: {
      status: g.summariesStatus,
      count: g.summariesCount,
      emptyCount: g.summariesEmptyCount,
      failedCount: g.summariesFailedCount,
      errorMessage: g.summariesErrorMessage ?? undefined,
    },
    files: {
      llms: { ready: Boolean(g.llmsBlobPath) },
      llmsFull: { ready: Boolean(g.llmsFullBlobPath) },
      pages: { ready: Boolean(g.pagesManifestBlobPath) },
    },
    errorMessage: g.errorMessage ?? undefined,
    startedAt: g.startedAt ?? undefined,
    completedAt: g.completedAt ?? undefined,
    createdAt: g.createdAt,
  };
}

const FILE_FIELDS = {
  llms: { field: 'llmsBlobPath', filename: 'llms.txt' },
  'llms-full': { field: 'llmsFullBlobPath', filename: 'llms-full.txt' },
} as const;
export type GenerationFileKind = keyof typeof FILE_FIELDS;

export async function readGenerationFile(
  generationId: number,
  userId: number,
  kind: GenerationFileKind,
): Promise<{ stream: ReadableStream; filename: string }> {
  const g = await assertOwnsGeneration(generationId, userId);
  const { field, filename } = FILE_FIELDS[kind];
  const path = g[field];
  if (!path) throw new ApiError(404, 'not_ready', 'File not ready');
  const blob = await get(path, { access: 'private' });
  if (!blob) throw new ApiError(404, 'not_found', 'File not found');
  return { stream: blob.stream, filename };
}

type ManifestEntry = { path: string; blobPath: string | null; status: 'ok' | 'error' | 'skipped'; bytes?: number };

export async function readPageManifest(
  generationId: number,
  userId: number,
): Promise<{
  status: PagesStatus;
  count: number;
  pages: Array<{ path: string; status: 'ok' | 'error' | 'skipped'; bytes?: number }>;
}> {
  const g = await assertOwnsGeneration(generationId, userId);
  if (!g.pagesManifestBlobPath) {
    return { status: g.pagesStatus, count: g.pagesCount, pages: [] };
  }
  const blob = await get(g.pagesManifestBlobPath, { access: 'private' });
  if (!blob) return { status: g.pagesStatus, count: g.pagesCount, pages: [] };
  const text = await new Response(blob.stream).text();
  const parsed = JSON.parse(text) as { pages?: ManifestEntry[] };
  return {
    status: g.pagesStatus,
    count: g.pagesCount,
    pages: (parsed.pages ?? []).map((p) => ({
      path: p.path,
      status: p.status,
      bytes: p.bytes,
    })),
  };
}

export async function readPageMarkdown(
  generationId: number,
  userId: number,
  path: string,
): Promise<ReadableStream> {
  const g = await assertOwnsGeneration(generationId, userId);
  if (!g.pagesManifestBlobPath) {
    throw new ApiError(404, 'not_found', 'No pages for this generation');
  }
  const manifestBlob = await get(g.pagesManifestBlobPath, { access: 'private' });
  if (!manifestBlob) throw new ApiError(404, 'not_found', 'Manifest missing');
  const manifest = JSON.parse(await new Response(manifestBlob.stream).text()) as {
    pages: ManifestEntry[];
  };
  const wanted = path.replace(/\.md$/, '');
  const entry = manifest.pages.find((p) => p.path === wanted && p.status === 'ok');
  if (!entry?.blobPath) throw new ApiError(404, 'not_found', 'Page not found');
  const blob = await get(entry.blobPath, { access: 'private' });
  if (!blob) throw new ApiError(404, 'not_found', 'Page blob missing');
  return blob.stream;
}
```

- [ ] **Step 4: Run test**

Run: `pnpm test src/lib/services/generations.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/
git commit -m "feat(services): add shared generations service layer"
```

---

## Task 8 — Migrate internal route handlers to call the service

**Files:**
- Modify: `src/app/api/generations/[id]/route.ts`
- Modify: `src/app/api/generations/[id]/files/[kind]/route.ts`
- Modify: `src/app/api/generations/[id]/pages/route.ts`
- Modify: `src/app/api/generations/[id]/pages/[...path]/route.ts`

- [ ] **Step 1: Run existing tests as a baseline**

Run: `pnpm test src/app/api/generations`
Expected: PASS — record any test that may need a tweak.

- [ ] **Step 2: Refactor `generations/[id]/files/[kind]/route.ts`**

Replace the body with:

```ts
import {
  apiErrorResponse,
  ApiError,
  requireUserOrThrow,
} from '@/lib/auth-guards';
import { readGenerationFile, type GenerationFileKind } from '@/lib/services/generations';

type Ctx = { params: Promise<{ id: string; kind: string }> };

const VALID_KINDS: GenerationFileKind[] = ['llms', 'llms-full'];

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const { id, kind } = await ctx.params;
    if (!(VALID_KINDS as string[]).includes(kind)) {
      throw new ApiError(400, 'validation', `Invalid kind: ${kind}`);
    }
    const user = await requireUserOrThrow();
    const n = Number(id);
    if (!Number.isInteger(n) || n <= 0) {
      throw new ApiError(404, 'not_found', 'Generation not found');
    }
    const { stream, filename } = await readGenerationFile(n, user.id, kind as GenerationFileKind);
    return new Response(stream, {
      status: 200,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'content-disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
```

- [ ] **Step 3: Refactor `generations/[id]/pages/route.ts`**

```ts
import { apiErrorResponse, ApiError, requireUserOrThrow } from '@/lib/auth-guards';
import { readPageManifest } from '@/lib/services/generations';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUserOrThrow();
    const { id } = await ctx.params;
    const n = Number(id);
    if (!Number.isInteger(n) || n <= 0) {
      throw new ApiError(404, 'not_found', 'Generation not found');
    }
    const manifest = await readPageManifest(n, user.id);
    return Response.json(manifest);
  } catch (err) {
    return apiErrorResponse(err);
  }
}
```

- [ ] **Step 4: Refactor `generations/[id]/pages/[...path]/route.ts`**

```ts
import { apiErrorResponse, ApiError, requireUserOrThrow } from '@/lib/auth-guards';
import { readPageMarkdown } from '@/lib/services/generations';

type Ctx = { params: Promise<{ id: string; path: string[] }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUserOrThrow();
    const { id, path } = await ctx.params;
    const n = Number(id);
    if (!Number.isInteger(n) || n <= 0) {
      throw new ApiError(404, 'not_found', 'Generation not found');
    }
    const stream = await readPageMarkdown(n, user.id, path.join('/'));
    return new Response(stream, {
      status: 200,
      headers: {
        'content-type': 'text/markdown; charset=utf-8',
        'content-disposition': 'inline',
      },
    });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
```

- [ ] **Step 5: Leave `generations/[id]/route.ts` alone**

This handler returns the raw generation row for the web UI. Do not change its response shape; the v1 route gets the curated view. Leave the file unchanged unless its existing tests fail.

- [ ] **Step 6: Run tests**

Run: `pnpm test src/app/api/generations`
Expected: PASS (same set as the baseline).

- [ ] **Step 7: Commit**

```bash
git add src/app/api/generations/
git commit -m "refactor(api): migrate internal generation routes to service layer"
```

---

## Task 9 — Install `zod-openapi` and define OpenAPI Zod schemas

**Files:**
- Modify: `package.json`
- Create: `src/lib/openapi/schemas.ts`
- Create: `src/lib/openapi/schemas.test.ts`

- [ ] **Step 1: Install zod-openapi**

Run:
```bash
pnpm add zod-openapi
```

Verify `package.json` shows `zod-openapi` under `dependencies`.

- [ ] **Step 2: Write the failing test**

`src/lib/openapi/schemas.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  createGenerationV1Schema,
  generationViewSchema,
  pageManifestSchema,
  errorSchema,
} from './schemas';

describe('createGenerationV1Schema', () => {
  it('accepts the siteId shape', () => {
    const r = createGenerationV1Schema.safeParse({ siteId: 1 });
    expect(r.success).toBe(true);
  });

  it('accepts the inline-site shape', () => {
    const r = createGenerationV1Schema.safeParse({ name: 'S', rootUrl: 'https://s.test' });
    expect(r.success).toBe(true);
  });

  it('rejects empty body', () => {
    const r = createGenerationV1Schema.safeParse({});
    expect(r.success).toBe(false);
  });
});

describe('generationViewSchema', () => {
  it('round-trips a complete view', () => {
    const sample = {
      id: 1,
      status: 'succeeded',
      pages: { status: 'succeeded', count: 5 },
      summaries: { status: 'succeeded', count: 5, emptyCount: 0, failedCount: 0 },
      files: {
        llms: { ready: true },
        llmsFull: { ready: true },
        pages: { ready: true },
      },
      createdAt: '2026-05-14T10:00:00Z',
    };
    expect(generationViewSchema.parse(sample)).toMatchObject({ id: 1 });
  });
});

describe('errorSchema', () => {
  it('shapes errors as { error: { code, message } }', () => {
    expect(errorSchema.parse({ error: { code: 'x', message: 'y' } })).toBeDefined();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test src/lib/openapi/schemas.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the schemas**

`src/lib/openapi/schemas.ts`:

```ts
import { z } from 'zod';
import 'zod-openapi/extend';

const httpUrl = z
  .string()
  .url()
  .refine((u) => /^https?:\/\//i.test(u), 'must start with http:// or https://');

export const generationStatusEnum = z
  .enum(['pending', 'running', 'succeeded', 'failed', 'cancelled'])
  .openapi({ ref: 'GenerationStatus' });

export const pagesStatusEnum = z
  .enum(['pending', 'running', 'succeeded', 'failed', 'skipped', 'cancelled'])
  .openapi({ ref: 'PagesStatus' });

export const summariesStatusEnum = pagesStatusEnum.openapi({ ref: 'SummariesStatus' });

const createGenerationBySiteId = z
  .object({
    siteId: z.number().int().positive(),
  })
  .strict();

const createGenerationByRootUrl = z
  .object({
    name: z.string().min(1).max(80),
    rootUrl: httpUrl,
    sitemapUrl: httpUrl.optional(),
  })
  .strict();

export const createGenerationV1Schema = z
  .union([createGenerationBySiteId, createGenerationByRootUrl])
  .openapi({ ref: 'CreateGenerationRequest' });

export const generationCreatedSchema = z
  .object({
    generation: z.object({
      id: z.number().int(),
      siteId: z.number().int(),
      status: generationStatusEnum,
      trigger: z.enum(['manual', 'webhook']),
      createdAt: z.string(),
      urls: z.object({
        self: z.string(),
        llms: z.string(),
        llmsFull: z.string(),
        pages: z.string(),
      }),
    }),
  })
  .openapi({ ref: 'GenerationCreated' });

export const generationViewSchema = z
  .object({
    id: z.number().int(),
    status: generationStatusEnum,
    pages: z.object({
      status: pagesStatusEnum,
      count: z.number().int(),
      errorMessage: z.string().optional(),
    }),
    summaries: z.object({
      status: summariesStatusEnum,
      count: z.number().int(),
      emptyCount: z.number().int(),
      failedCount: z.number().int(),
      errorMessage: z.string().optional(),
    }),
    files: z.object({
      llms: z.object({ ready: z.boolean(), url: z.string().optional() }),
      llmsFull: z.object({ ready: z.boolean(), url: z.string().optional() }),
      pages: z.object({ ready: z.boolean(), url: z.string().optional() }),
    }),
    errorMessage: z.string().optional(),
    startedAt: z.string().optional(),
    completedAt: z.string().optional(),
    createdAt: z.string(),
  })
  .openapi({ ref: 'GenerationView' });

export const pageManifestSchema = z
  .object({
    status: pagesStatusEnum,
    count: z.number().int(),
    pages: z.array(
      z.object({
        path: z.string(),
        url: z.string(),
        status: z.enum(['ok', 'error', 'skipped']),
        bytes: z.number().int().optional(),
      }),
    ),
  })
  .openapi({ ref: 'PageManifest' });

export const errorSchema = z
  .object({
    error: z.object({ code: z.string(), message: z.string() }),
  })
  .openapi({ ref: 'ApiError' });

export type CreateGenerationV1Input = z.infer<typeof createGenerationV1Schema>;
export type GenerationViewDto = z.infer<typeof generationViewSchema>;
export type PageManifestDto = z.infer<typeof pageManifestSchema>;
```

- [ ] **Step 5: Run test**

Run: `pnpm test src/lib/openapi/schemas.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml src/lib/openapi/
git commit -m "feat(openapi): install zod-openapi and define v1 schemas"
```

---

## Task 10 — `POST /api/v1/generations` and `GET /api/v1/generations/[id]`

**Files:**
- Create: `src/app/api/v1/generations/route.ts`
- Create: `src/app/api/v1/generations/route.test.ts`
- Create: `src/app/api/v1/generations/[id]/route.ts`
- Create: `src/app/api/v1/generations/[id]/route.test.ts`

- [ ] **Step 1: Write the failing test for POST**

`src/app/api/v1/generations/route.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { users, sites, apiTokens } from '@/db/schema';
import { createApiToken } from '@/lib/tokens/api-token';

vi.mock('workflow/api', () => ({ start: vi.fn(async () => ({ runId: 'wf-1' })) }));

import { POST } from './route';

function postReq(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://t/api/v1/generations', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

async function seed() {
  await setupTestDb();
  const db = getDb();
  const [u] = await db.insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
  const { token, hash, prefix } = createApiToken();
  await db.insert(apiTokens).values({
    userId: u.id, name: 'CI', tokenHash: hash, tokenPrefix: prefix,
  });
  return { user: u, token };
}

describe('POST /api/v1/generations', () => {
  it('401 when no bearer token', async () => {
    await setupTestDb();
    const res = await POST(postReq({ siteId: 1 }));
    expect(res.status).toBe(401);
  });

  it('400 when body fails validation', async () => {
    const { token } = await seed();
    const res = await POST(postReq({}, { authorization: `Bearer ${token}` }));
    expect(res.status).toBe(400);
  });

  it('201 with curated body for inline-site shape', async () => {
    const { token } = await seed();
    const res = await POST(
      postReq({ name: 'Acme', rootUrl: 'https://acme.test' }, { authorization: `Bearer ${token}` }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.generation.urls.self).toMatch(/\/api\/v1\/generations\/\d+$/);
    expect(body.generation.urls.llms).toMatch(/\/llms\.txt$/);
  });

  it('201 for an existing siteId owned by the user', async () => {
    const { user, token } = await seed();
    const db = getDb();
    const [s] = await db
      .insert(sites)
      .values({ userId: user.id, name: 'S', rootUrl: 'https://s.test', webhookTokenHash: 'h'.repeat(64), webhookTokenPrefix: 'lmt_aaaa' })
      .returning();
    const res = await POST(postReq({ siteId: s.id }, { authorization: `Bearer ${token}` }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.generation.siteId).toBe(s.id);
  });

  it('404 when siteId is not owned', async () => {
    const { token } = await seed();
    const db = getDb();
    const [other] = await db.insert(users).values({ name: 'O', email: 'o@o.test' }).returning();
    const [s] = await db
      .insert(sites)
      .values({ userId: other.id, name: 'X', rootUrl: 'https://x.test', webhookTokenHash: 'h'.repeat(64), webhookTokenPrefix: 'lmt_bbbb' })
      .returning();
    const res = await POST(postReq({ siteId: s.id }, { authorization: `Bearer ${token}` }));
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/app/api/v1/generations/route.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement POST**

`src/app/api/v1/generations/route.ts`:

```ts
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { sites } from '@/db/schema';
import {
  ApiError,
  apiErrorResponse,
  assertOwnsSite,
  requireApiTokenOrThrow,
} from '@/lib/auth-guards';
import { createGenerationV1Schema } from '@/lib/openapi/schemas';
import { createWebhookToken } from '@/lib/webhook-token';
import { enqueueGenerationsForSite } from '@/lib/enqueue-generations';

export async function POST(req: Request) {
  try {
    const user = await requireApiTokenOrThrow(req);
    const parsed = createGenerationV1Schema.safeParse(await req.json());
    if (!parsed.success) {
      throw new ApiError(400, 'validation', parsed.error.message);
    }
    const body = parsed.data;

    let siteId: number;
    if ('siteId' in body) {
      await assertOwnsSite(body.siteId, user.id);
      siteId = body.siteId;
    } else {
      const tok = createWebhookToken();
      const existing = await getDb()
        .select()
        .from(sites)
        .where(and(eq(sites.userId, user.id), eq(sites.rootUrl, body.rootUrl)));
      if (existing.length > 0) {
        siteId = existing[0].id;
      } else {
        const [row] = await getDb()
          .insert(sites)
          .values({
            userId: user.id,
            name: body.name,
            rootUrl: body.rootUrl,
            sitemapUrl: body.sitemapUrl ?? null,
            webhookTokenHash: tok.hash,
            webhookTokenPrefix: tok.prefix,
          })
          .returning();
        siteId = row.id;
      }
    }

    const generation = await enqueueGenerationsForSite(siteId, { trigger: 'manual' });
    const base = new URL(req.url);
    const self = `${base.origin}/api/v1/generations/${generation.id}`;
    return Response.json(
      {
        generation: {
          id: generation.id,
          siteId: generation.siteId,
          status: generation.status,
          trigger: generation.trigger,
          createdAt: generation.createdAt,
          urls: {
            self,
            llms: `${self}/llms.txt`,
            llmsFull: `${self}/llms-full.txt`,
            pages: `${self}/pages`,
          },
        },
      },
      { status: 201 },
    );
  } catch (err) {
    return apiErrorResponse(err);
  }
}
```

- [ ] **Step 4: Run POST test**

Run: `pnpm test src/app/api/v1/generations/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing test for GET /[id]**

`src/app/api/v1/generations/[id]/route.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { users, sites, generations, apiTokens } from '@/db/schema';
import { createApiToken } from '@/lib/tokens/api-token';

vi.mock('@vercel/blob', () => ({ get: vi.fn(async () => null) }));

import { GET } from './route';

async function seed(overrides: Partial<typeof generations.$inferInsert> = {}) {
  await setupTestDb();
  const db = getDb();
  const [u] = await db.insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
  const [s] = await db
    .insert(sites)
    .values({ userId: u.id, name: 'S', rootUrl: 'https://s.test', webhookTokenHash: 'h'.repeat(64), webhookTokenPrefix: 'lmt_aaaa' })
    .returning();
  const [g] = await db
    .insert(generations)
    .values({ siteId: s.id, userId: u.id, status: 'pending', trigger: 'manual', ...overrides })
    .returning();
  const { token, hash, prefix } = createApiToken();
  await db.insert(apiTokens).values({ userId: u.id, name: 'CI', tokenHash: hash, tokenPrefix: prefix });
  return { gen: g, token };
}

function req(token: string) {
  return new Request(`http://t/api/v1/generations/1`, {
    headers: { authorization: `Bearer ${token}` },
  });
}

describe('GET /api/v1/generations/[id]', () => {
  it('401 without a bearer token', async () => {
    await setupTestDb();
    const res = await GET(new Request('http://t/api/v1/generations/1'), { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(401);
  });

  it('returns curated view with no file URLs when blobs not ready', async () => {
    const { gen, token } = await seed();
    const res = await GET(req(token), { params: Promise.resolve({ id: String(gen.id) }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.files.llms.ready).toBe(false);
    expect(body.files.llms.url).toBeUndefined();
  });

  it('includes file URLs when blobs are ready', async () => {
    const { gen, token } = await seed({
      status: 'succeeded',
      llmsBlobPath: 'p',
      llmsFullBlobPath: 'q',
      pagesManifestBlobPath: 'm',
    });
    const res = await GET(req(token), { params: Promise.resolve({ id: String(gen.id) }) });
    const body = await res.json();
    expect(body.files.llms.url).toMatch(/\/llms\.txt$/);
    expect(body.files.pages.url).toMatch(/\/pages$/);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm test src/app/api/v1/generations/\[id\]/route.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement GET**

`src/app/api/v1/generations/[id]/route.ts`:

```ts
import { ApiError, apiErrorResponse, requireApiTokenOrThrow } from '@/lib/auth-guards';
import { getGenerationView } from '@/lib/services/generations';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  try {
    const user = await requireApiTokenOrThrow(req);
    const { id } = await ctx.params;
    const n = Number(id);
    if (!Number.isInteger(n) || n <= 0) {
      throw new ApiError(404, 'not_found', 'Generation not found');
    }
    const view = await getGenerationView(n, user.id);
    const base = new URL(req.url);
    const root = `${base.origin}/api/v1/generations/${n}`;
    return Response.json({
      ...view,
      files: {
        llms: { ready: view.files.llms.ready, url: view.files.llms.ready ? `${root}/llms.txt` : undefined },
        llmsFull: { ready: view.files.llmsFull.ready, url: view.files.llmsFull.ready ? `${root}/llms-full.txt` : undefined },
        pages: { ready: view.files.pages.ready, url: view.files.pages.ready ? `${root}/pages` : undefined },
      },
    });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
```

- [ ] **Step 8: Run GET test**

Run: `pnpm test src/app/api/v1/generations`
Expected: PASS (both files).

- [ ] **Step 9: Commit**

```bash
git add src/app/api/v1/generations/
git commit -m "feat(api/v1): add POST /generations and GET /generations/[id]"
```

---

## Task 11 — v1 file download routes: `llms.txt` and `llms-full.txt`

**Files:**
- Create: `src/app/api/v1/generations/[id]/llms.txt/route.ts`
- Create: `src/app/api/v1/generations/[id]/llms.txt/route.test.ts`
- Create: `src/app/api/v1/generations/[id]/llms-full.txt/route.ts`
- Create: `src/app/api/v1/generations/[id]/llms-full.txt/route.test.ts`

- [ ] **Step 1: Write the failing test for llms.txt**

`src/app/api/v1/generations/[id]/llms.txt/route.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { users, sites, generations, apiTokens } from '@/db/schema';
import { createApiToken } from '@/lib/tokens/api-token';

vi.mock('@vercel/blob', () => ({
  get: vi.fn(async (path: string) =>
    path === 'L' ? { stream: new Response('llms body').body } : null,
  ),
}));

import { GET } from './route';

async function seed(withBlob = true) {
  await setupTestDb();
  const db = getDb();
  const [u] = await db.insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
  const [s] = await db
    .insert(sites)
    .values({ userId: u.id, name: 'S', rootUrl: 'https://s.test', webhookTokenHash: 'h'.repeat(64), webhookTokenPrefix: 'lmt_aaaa' })
    .returning();
  const [g] = await db
    .insert(generations)
    .values({
      siteId: s.id,
      userId: u.id,
      status: 'succeeded',
      trigger: 'manual',
      llmsBlobPath: withBlob ? 'L' : null,
    })
    .returning();
  const { token, hash, prefix } = createApiToken();
  await db.insert(apiTokens).values({ userId: u.id, name: 'CI', tokenHash: hash, tokenPrefix: prefix });
  return { gen: g, token };
}

describe('GET /api/v1/generations/[id]/llms.txt', () => {
  it('streams the blob with text/plain', async () => {
    const { gen, token } = await seed(true);
    const r = new Request('http://t', { headers: { authorization: `Bearer ${token}` } });
    const res = await GET(r, { params: Promise.resolve({ id: String(gen.id) }) });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/plain/);
    expect(await res.text()).toBe('llms body');
  });

  it('404 not_ready when blob path is null', async () => {
    const { gen, token } = await seed(false);
    const r = new Request('http://t', { headers: { authorization: `Bearer ${token}` } });
    const res = await GET(r, { params: Promise.resolve({ id: String(gen.id) }) });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('not_ready');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/app/api/v1/generations/\[id\]/llms.txt/route.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement llms.txt**

`src/app/api/v1/generations/[id]/llms.txt/route.ts`:

```ts
import { ApiError, apiErrorResponse, requireApiTokenOrThrow } from '@/lib/auth-guards';
import { readGenerationFile } from '@/lib/services/generations';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  try {
    const user = await requireApiTokenOrThrow(req);
    const { id } = await ctx.params;
    const n = Number(id);
    if (!Number.isInteger(n) || n <= 0) {
      throw new ApiError(404, 'not_found', 'Generation not found');
    }
    const { stream, filename } = await readGenerationFile(n, user.id, 'llms');
    return new Response(stream, {
      status: 200,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'content-disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
```

- [ ] **Step 4: Mirror for llms-full.txt**

`src/app/api/v1/generations/[id]/llms-full.txt/route.ts`:

```ts
import { ApiError, apiErrorResponse, requireApiTokenOrThrow } from '@/lib/auth-guards';
import { readGenerationFile } from '@/lib/services/generations';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  try {
    const user = await requireApiTokenOrThrow(req);
    const { id } = await ctx.params;
    const n = Number(id);
    if (!Number.isInteger(n) || n <= 0) {
      throw new ApiError(404, 'not_found', 'Generation not found');
    }
    const { stream, filename } = await readGenerationFile(n, user.id, 'llms-full');
    return new Response(stream, {
      status: 200,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'content-disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
```

`src/app/api/v1/generations/[id]/llms-full.txt/route.test.ts` mirrors the llms.txt test — swap blob field `llmsBlobPath` → `llmsFullBlobPath`, blob path key `'L'` → `'LF'`, and the assertion's expected filename to `llms-full.txt`. Copy and adjust:

```ts
import { describe, it, expect, vi } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { users, sites, generations, apiTokens } from '@/db/schema';
import { createApiToken } from '@/lib/tokens/api-token';

vi.mock('@vercel/blob', () => ({
  get: vi.fn(async (path: string) =>
    path === 'LF' ? { stream: new Response('full body').body } : null,
  ),
}));

import { GET } from './route';

async function seed(withBlob = true) {
  await setupTestDb();
  const db = getDb();
  const [u] = await db.insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
  const [s] = await db
    .insert(sites)
    .values({ userId: u.id, name: 'S', rootUrl: 'https://s.test', webhookTokenHash: 'h'.repeat(64), webhookTokenPrefix: 'lmt_aaaa' })
    .returning();
  const [g] = await db
    .insert(generations)
    .values({
      siteId: s.id, userId: u.id, status: 'succeeded', trigger: 'manual',
      llmsFullBlobPath: withBlob ? 'LF' : null,
    })
    .returning();
  const { token, hash, prefix } = createApiToken();
  await db.insert(apiTokens).values({ userId: u.id, name: 'CI', tokenHash: hash, tokenPrefix: prefix });
  return { gen: g, token };
}

describe('GET /api/v1/generations/[id]/llms-full.txt', () => {
  it('streams the blob', async () => {
    const { gen, token } = await seed(true);
    const r = new Request('http://t', { headers: { authorization: `Bearer ${token}` } });
    const res = await GET(r, { params: Promise.resolve({ id: String(gen.id) }) });
    expect(res.headers.get('content-disposition')).toContain('llms-full.txt');
    expect(await res.text()).toBe('full body');
  });

  it('404 not_ready when blob missing', async () => {
    const { gen, token } = await seed(false);
    const r = new Request('http://t', { headers: { authorization: `Bearer ${token}` } });
    const res = await GET(r, { params: Promise.resolve({ id: String(gen.id) }) });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 5: Run all tests**

Run: `pnpm test src/app/api/v1/generations/\[id\]`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/v1/generations/\[id\]/llms.txt src/app/api/v1/generations/\[id\]/llms-full.txt
git commit -m "feat(api/v1): add llms.txt and llms-full.txt download routes"
```

---

## Task 12 — v1 pages routes: manifest and single page

**Files:**
- Create: `src/app/api/v1/generations/[id]/pages/route.ts`
- Create: `src/app/api/v1/generations/[id]/pages/route.test.ts`
- Create: `src/app/api/v1/generations/[id]/pages/[...path]/route.ts`
- Create: `src/app/api/v1/generations/[id]/pages/[...path]/route.test.ts`

- [ ] **Step 1: Write the failing test for manifest**

`src/app/api/v1/generations/[id]/pages/route.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { users, sites, generations, apiTokens } from '@/db/schema';
import { createApiToken } from '@/lib/tokens/api-token';

vi.mock('@vercel/blob', () => ({
  get: vi.fn(async () => ({
    stream: new Response(
      JSON.stringify({ pages: [{ path: 'about', blobPath: 'pages/about.md', status: 'ok', bytes: 11 }] }),
    ).body,
  })),
}));

import { GET } from './route';

async function seed() {
  await setupTestDb();
  const db = getDb();
  const [u] = await db.insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
  const [s] = await db
    .insert(sites)
    .values({ userId: u.id, name: 'S', rootUrl: 'https://s.test', webhookTokenHash: 'h'.repeat(64), webhookTokenPrefix: 'lmt_aaaa' })
    .returning();
  const [g] = await db
    .insert(generations)
    .values({
      siteId: s.id, userId: u.id, status: 'succeeded', trigger: 'manual',
      pagesManifestBlobPath: 'M', pagesCount: 1, pagesStatus: 'succeeded',
    })
    .returning();
  const { token, hash, prefix } = createApiToken();
  await db.insert(apiTokens).values({ userId: u.id, name: 'CI', tokenHash: hash, tokenPrefix: prefix });
  return { gen: g, token };
}

describe('GET /api/v1/generations/[id]/pages', () => {
  it('returns manifest with per-page URLs', async () => {
    const { gen, token } = await seed();
    const r = new Request(`http://t/api/v1/generations/${gen.id}/pages`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const res = await GET(r, { params: Promise.resolve({ id: String(gen.id) }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pages[0].url).toMatch(/\/pages\/about$/);
    expect(body.pages[0].status).toBe('ok');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/app/api/v1/generations/\[id\]/pages/route.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the manifest route**

`src/app/api/v1/generations/[id]/pages/route.ts`:

```ts
import { ApiError, apiErrorResponse, requireApiTokenOrThrow } from '@/lib/auth-guards';
import { readPageManifest } from '@/lib/services/generations';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  try {
    const user = await requireApiTokenOrThrow(req);
    const { id } = await ctx.params;
    const n = Number(id);
    if (!Number.isInteger(n) || n <= 0) {
      throw new ApiError(404, 'not_found', 'Generation not found');
    }
    const manifest = await readPageManifest(n, user.id);
    const base = new URL(req.url);
    const root = `${base.origin}/api/v1/generations/${n}/pages`;
    return Response.json({
      ...manifest,
      pages: manifest.pages.map((p) => ({ ...p, url: `${root}/${p.path}` })),
    });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
```

- [ ] **Step 4: Write the failing test for single page**

`src/app/api/v1/generations/[id]/pages/[...path]/route.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { users, sites, generations, apiTokens } from '@/db/schema';
import { createApiToken } from '@/lib/tokens/api-token';

vi.mock('@vercel/blob', () => ({
  get: vi.fn(async (p: string) => {
    if (p === 'M') {
      return {
        stream: new Response(
          JSON.stringify({ pages: [{ path: 'about', blobPath: 'pages/about.md', status: 'ok' }] }),
        ).body,
      };
    }
    if (p === 'pages/about.md') {
      return { stream: new Response('# About').body };
    }
    return null;
  }),
}));

import { GET } from './route';

async function seed() {
  await setupTestDb();
  const db = getDb();
  const [u] = await db.insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
  const [s] = await db
    .insert(sites)
    .values({ userId: u.id, name: 'S', rootUrl: 'https://s.test', webhookTokenHash: 'h'.repeat(64), webhookTokenPrefix: 'lmt_aaaa' })
    .returning();
  const [g] = await db
    .insert(generations)
    .values({
      siteId: s.id, userId: u.id, status: 'succeeded', trigger: 'manual',
      pagesManifestBlobPath: 'M', pagesCount: 1, pagesStatus: 'succeeded',
    })
    .returning();
  const { token, hash, prefix } = createApiToken();
  await db.insert(apiTokens).values({ userId: u.id, name: 'CI', tokenHash: hash, tokenPrefix: prefix });
  return { gen: g, token };
}

describe('GET /api/v1/generations/[id]/pages/[...path]', () => {
  it('streams the page markdown', async () => {
    const { gen, token } = await seed();
    const r = new Request('http://t', { headers: { authorization: `Bearer ${token}` } });
    const res = await GET(r, { params: Promise.resolve({ id: String(gen.id), path: ['about'] }) });
    expect(res.headers.get('content-type')).toMatch(/text\/markdown/);
    expect(await res.text()).toBe('# About');
  });

  it('404 when the page is not in the manifest', async () => {
    const { gen, token } = await seed();
    const r = new Request('http://t', { headers: { authorization: `Bearer ${token}` } });
    const res = await GET(r, { params: Promise.resolve({ id: String(gen.id), path: ['missing'] }) });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `pnpm test src/app/api/v1/generations/\[id\]/pages/\[...path\]/route.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 6: Implement the single-page route**

`src/app/api/v1/generations/[id]/pages/[...path]/route.ts`:

```ts
import { ApiError, apiErrorResponse, requireApiTokenOrThrow } from '@/lib/auth-guards';
import { readPageMarkdown } from '@/lib/services/generations';

type Ctx = { params: Promise<{ id: string; path: string[] }> };

export async function GET(req: Request, ctx: Ctx) {
  try {
    const user = await requireApiTokenOrThrow(req);
    const { id, path } = await ctx.params;
    const n = Number(id);
    if (!Number.isInteger(n) || n <= 0) {
      throw new ApiError(404, 'not_found', 'Generation not found');
    }
    const stream = await readPageMarkdown(n, user.id, path.join('/'));
    return new Response(stream, {
      status: 200,
      headers: {
        'content-type': 'text/markdown; charset=utf-8',
        'content-disposition': 'inline',
      },
    });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
```

- [ ] **Step 7: Run all v1 tests**

Run: `pnpm test src/app/api/v1`
Expected: PASS for all v1 route tests.

- [ ] **Step 8: Commit**

```bash
git add src/app/api/v1/generations/\[id\]/pages
git commit -m "feat(api/v1): add pages manifest and single-page routes"
```

---

## Task 13 — OpenAPI route descriptors and document builder

**Files:**
- Create: `src/lib/openapi/routes.ts`
- Create: `src/lib/openapi/document.ts`
- Create: `src/lib/openapi/document.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/openapi/document.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildOpenApiDocument } from './document';

describe('buildOpenApiDocument', () => {
  const doc = buildOpenApiDocument({ publicBaseUrl: 'https://example.test' });

  it('has version 1.0.0', () => {
    expect(doc.info.version).toBe('1.0.0');
  });

  it('declares bearerAuth at document level', () => {
    expect(doc.components?.securitySchemes?.bearerAuth).toBeDefined();
  });

  it('contains all six v1 paths', () => {
    const paths = Object.keys(doc.paths ?? {});
    expect(paths).toEqual(
      expect.arrayContaining([
        '/generations',
        '/generations/{id}',
        '/generations/{id}/llms.txt',
        '/generations/{id}/llms-full.txt',
        '/generations/{id}/pages',
        '/generations/{id}/pages/{path}',
      ]),
    );
  });

  it('every operation declares bearerAuth security', () => {
    for (const path of Object.values(doc.paths ?? {})) {
      for (const op of Object.values(path as Record<string, unknown>)) {
        expect((op as { security: unknown[] }).security).toEqual([{ bearerAuth: [] }]);
      }
    }
  });

  it('uses the supplied servers url', () => {
    expect(doc.servers?.[0].url).toBe('https://example.test/api/v1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/openapi/document.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement route descriptors**

`src/lib/openapi/routes.ts`:

```ts
import {
  createGenerationV1Schema,
  generationCreatedSchema,
  generationViewSchema,
  pageManifestSchema,
  errorSchema,
} from './schemas';

export const v1Routes = {
  createGeneration: {
    method: 'post',
    path: '/generations',
    summary: 'Kick off a generation',
    tags: ['generations'],
    requestBody: createGenerationV1Schema,
    responses: {
      201: { description: 'Created', schema: generationCreatedSchema },
      400: { description: 'Validation error', schema: errorSchema },
      401: { description: 'Unauthenticated', schema: errorSchema },
      404: { description: 'Site not found', schema: errorSchema },
    },
  },
  getGeneration: {
    method: 'get',
    path: '/generations/{id}',
    summary: 'Get generation status',
    tags: ['generations'],
    pathParams: { id: 'integer' as const },
    responses: {
      200: { description: 'OK', schema: generationViewSchema },
      401: { description: 'Unauthenticated', schema: errorSchema },
      404: { description: 'Not found', schema: errorSchema },
    },
  },
  getLlmsTxt: {
    method: 'get',
    path: '/generations/{id}/llms.txt',
    summary: 'Download llms.txt',
    tags: ['generations'],
    pathParams: { id: 'integer' as const },
    responses: {
      200: { description: 'OK', contentType: 'text/plain' },
      401: { description: 'Unauthenticated', schema: errorSchema },
      404: { description: 'Not ready or not found', schema: errorSchema },
    },
  },
  getLlmsFullTxt: {
    method: 'get',
    path: '/generations/{id}/llms-full.txt',
    summary: 'Download llms-full.txt',
    tags: ['generations'],
    pathParams: { id: 'integer' as const },
    responses: {
      200: { description: 'OK', contentType: 'text/plain' },
      401: { description: 'Unauthenticated', schema: errorSchema },
      404: { description: 'Not ready or not found', schema: errorSchema },
    },
  },
  getPages: {
    method: 'get',
    path: '/generations/{id}/pages',
    summary: 'List page manifest',
    tags: ['generations'],
    pathParams: { id: 'integer' as const },
    responses: {
      200: { description: 'OK', schema: pageManifestSchema },
      401: { description: 'Unauthenticated', schema: errorSchema },
      404: { description: 'Not found', schema: errorSchema },
    },
  },
  getPage: {
    method: 'get',
    path: '/generations/{id}/pages/{path}',
    summary: 'Get one page as markdown',
    tags: ['generations'],
    pathParams: { id: 'integer' as const, path: 'string' as const },
    responses: {
      200: { description: 'OK', contentType: 'text/markdown' },
      401: { description: 'Unauthenticated', schema: errorSchema },
      404: { description: 'Not found', schema: errorSchema },
    },
  },
} as const;
```

- [ ] **Step 4: Implement the document builder**

`src/lib/openapi/document.ts`:

```ts
import { createDocument } from 'zod-openapi';
import { v1Routes } from './routes';

type Route = (typeof v1Routes)[keyof typeof v1Routes];

export function buildOpenApiDocument(opts: { publicBaseUrl?: string }) {
  const base = (opts.publicBaseUrl ?? 'http://localhost:3000').replace(/\/$/, '');
  const paths: Record<string, Record<string, unknown>> = {};

  for (const r of Object.values(v1Routes) as Route[]) {
    const op: Record<string, unknown> = {
      summary: r.summary,
      tags: r.tags,
      security: [{ bearerAuth: [] }],
      responses: Object.fromEntries(
        Object.entries(r.responses).map(([code, spec]) => {
          if ('schema' in spec && spec.schema) {
            return [
              code,
              {
                description: spec.description,
                content: { 'application/json': { schema: spec.schema } },
              },
            ];
          }
          return [
            code,
            {
              description: spec.description,
              content: spec.contentType ? { [spec.contentType]: {} } : undefined,
            },
          ];
        }),
      ),
    };

    if ('pathParams' in r && r.pathParams) {
      op.parameters = Object.entries(r.pathParams).map(([name, type]) => ({
        name,
        in: 'path',
        required: true,
        schema: { type: type === 'integer' ? 'integer' : 'string' },
      }));
    }

    if ('requestBody' in r && r.requestBody) {
      op.requestBody = {
        required: true,
        content: { 'application/json': { schema: r.requestBody } },
      };
    }

    paths[r.path] = { ...(paths[r.path] ?? {}), [r.method]: op };
  }

  return createDocument({
    openapi: '3.1.0',
    info: {
      title: 'make-a-llms.txt API',
      version: '1.0.0',
      description: 'Generate llms.txt, llms-full.txt, and per-page markdown.',
    },
    servers: [{ url: `${base}/api/v1` }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'mklt_pat' },
      },
    },
    paths,
  });
}
```

- [ ] **Step 5: Run test**

Run: `pnpm test src/lib/openapi/document.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/openapi/
git commit -m "feat(openapi): add route descriptors and document builder"
```

---

## Task 14 — Build script, package.json wiring, gitignore

**Files:**
- Create: `scripts/build-openapi.ts`
- Modify: `package.json`
- Modify: `.gitignore`

- [ ] **Step 1: Install tsx (build runner)**

Run:
```bash
pnpm add -D tsx
```

Verify `package.json` shows `tsx` under `devDependencies`.

- [ ] **Step 2: Write the build script**

`scripts/build-openapi.ts`:

```ts
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { buildOpenApiDocument } from '../src/lib/openapi/document';

const outDir = path.resolve(process.cwd(), 'public');
mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'openapi.json');

const doc = buildOpenApiDocument({ publicBaseUrl: process.env.PUBLIC_BASE_URL });
writeFileSync(outPath, JSON.stringify(doc, null, 2));
console.log(`Wrote ${outPath}`);
```

- [ ] **Step 3: Wire into `package.json`**

Update the `scripts` block:

```json
{
  "scripts": {
    "dev": "next dev",
    "build:openapi": "tsx scripts/build-openapi.ts",
    "build": "pnpm build:openapi && next build",
    "start": "next start",
    "lint": "eslint",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio",
    "test": "vitest run",
    "test:watch": "vitest",
    "format": "prettier --write .",
    "format:check": "prettier --check ."
  }
}
```

- [ ] **Step 4: Update `.gitignore`**

Append:
```
# Generated OpenAPI document (rebuilt by pnpm build:openapi)
public/openapi.json
```

- [ ] **Step 5: Run the build script**

Run: `pnpm build:openapi`
Expected: `Wrote .../public/openapi.json`. Inspect the file briefly — confirm it has `openapi: "3.1.0"`, `info.version: "1.0.0"`, and the six paths.

- [ ] **Step 6: Commit**

```bash
git add scripts/build-openapi.ts package.json pnpm-lock.yaml .gitignore
git commit -m "feat(build): generate openapi.json at build time"
```

---

## Task 15 — Install fumadocs and scaffold config

**Files:**
- Create: `source.config.ts` (repo root)
- Create: `src/lib/docs/source.ts`
- Create: `src/lib/docs/openapi.ts`
- Modify: `package.json`
- Modify: `next.config.ts`

- [ ] **Step 1: Install fumadocs**

Run:
```bash
pnpm add fumadocs-core fumadocs-ui fumadocs-openapi fumadocs-mdx
```

Verify `package.json` shows all four under `dependencies`.

- [ ] **Step 2: Create `source.config.ts`**

`source.config.ts` at the repo root:

```ts
import { defineConfig, defineDocs } from 'fumadocs-mdx/config';

export const docs = defineDocs({
  dir: 'content/docs',
});

export default defineConfig();
```

- [ ] **Step 3: Wire fumadocs-mdx into `next.config.ts`**

Modify `next.config.ts`:

```ts
import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

const nextConfig = {
  // existing config preserved
};

export default withMDX(nextConfig);
```

(If `next.config.ts` already has content, wrap the existing export in `withMDX`.)

- [ ] **Step 4: Create the docs source**

`src/lib/docs/source.ts`:

```ts
import { loader } from 'fumadocs-core/source';
import { docs } from '../../../source.config';

export const source = loader({
  baseUrl: '/docs',
  source: docs.toFumadocsSource(),
});
```

- [ ] **Step 5: Create the OpenAPI source**

`src/lib/docs/openapi.ts`:

```ts
import { createOpenAPI } from 'fumadocs-openapi/server';

export const openapi = createOpenAPI({
  input: ['./public/openapi.json'],
});
```

- [ ] **Step 6: Sanity-check the install**

Run:
```bash
pnpm typecheck 2>/dev/null || pnpm tsc --noEmit
```

Expected: no type errors (fumadocs APIs are correct).

If a fumadocs API has changed in a newer version, consult `node_modules/fumadocs-core/dist/source/loader.d.ts` and adjust — do not invent imports.

- [ ] **Step 7: Commit**

```bash
git add source.config.ts src/lib/docs/ package.json pnpm-lock.yaml next.config.ts
git commit -m "feat(docs): install fumadocs and scaffold source config"
```

---

## Task 16 — Docs routes and MDX content

**Files:**
- Create: `src/app/docs/layout.tsx`
- Create: `src/app/docs/[[...slug]]/page.tsx`
- Create: `src/app/docs/api/[[...slug]]/page.tsx`
- Create: `content/docs/index.mdx`
- Create: `content/docs/authentication.mdx`
- Create: `content/docs/quickstart.mdx`
- Create: `content/docs/meta.json`

- [ ] **Step 1: Docs layout**

`src/app/docs/layout.tsx`:

```tsx
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { source } from '@/lib/docs/source';
import 'fumadocs-ui/css/style.css';

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <DocsLayout tree={source.pageTree} nav={{ title: 'make-a-llms.txt' }}>
      {children}
    </DocsLayout>
  );
}
```

- [ ] **Step 2: MDX page renderer**

`src/app/docs/[[...slug]]/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import { DocsBody, DocsPage, DocsTitle } from 'fumadocs-ui/page';
import { source } from '@/lib/docs/source';

type Props = { params: Promise<{ slug?: string[] }> };

export default async function Page({ params }: Props) {
  const { slug } = await params;
  const page = source.getPage(slug);
  if (!page) notFound();
  const MDX = page.data.body;
  return (
    <DocsPage toc={page.data.toc}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsBody>
        <MDX />
      </DocsBody>
    </DocsPage>
  );
}

export function generateStaticParams() {
  return source.generateParams();
}
```

- [ ] **Step 3: OpenAPI page renderer**

`src/app/docs/api/[[...slug]]/page.tsx`:

```tsx
import { openapi } from '@/lib/docs/openapi';
import { DocsBody, DocsPage, DocsTitle } from 'fumadocs-ui/page';
import { notFound } from 'next/navigation';

type Props = { params: Promise<{ slug?: string[] }> };

export default async function ApiPage({ params }: Props) {
  const { slug = [] } = await params;
  const operation = openapi.getOperation(slug);
  if (!operation) notFound();
  return (
    <DocsPage>
      <DocsTitle>{operation.summary ?? 'API'}</DocsTitle>
      <DocsBody>
        <openapi.APIPage operations={[operation]} />
      </DocsBody>
    </DocsPage>
  );
}

export function generateStaticParams() {
  return openapi.generateParams();
}
```

> Note: `fumadocs-openapi`'s exact API names may differ between versions — if `openapi.getOperation` or `openapi.APIPage` aren't found, consult `node_modules/fumadocs-openapi/dist/` to find the equivalents. Do not invent names. The shape above is the v8+ convention.

- [ ] **Step 4: Author the MDX pages**

`content/docs/meta.json`:

```json
{
  "title": "Docs",
  "pages": ["index", "authentication", "quickstart", "---API Reference---", "api"]
}
```

`content/docs/index.mdx`:

```mdx
---
title: make-a-llms.txt API
description: Generate llms.txt, llms-full.txt, and per-page markdown programmatically.
---

The make-a-llms.txt API lets you kick off generations, poll their status, and
download the resulting artifacts — `llms.txt`, `llms-full.txt`, and per-page
markdown — from your own scripts and CI pipelines.

Continue to [Authentication](/docs/authentication) to mint a token, then
follow the [Quickstart](/docs/quickstart) for a full end-to-end walkthrough.
```

`content/docs/authentication.mdx`:

```mdx
---
title: Authentication
description: Mint a personal access token and use it as a Bearer token.
---

The API is authenticated by **personal access tokens (PATs)**. Mint a token in
[Settings → API Tokens](/settings/api-tokens). The full token is shown exactly
once on creation — copy it immediately.

Send the token as a `Bearer` header on every request:

```bash
curl -H "Authorization: Bearer mklt_pat_..." https://make-a-llms.txt/api/v1/generations/1
```

If a token is missing, malformed, expired, or revoked, the API returns
`401 Unauthenticated` with the same generic message in every case. Rotate
tokens by creating a new one and revoking the old one from the same settings
page.
```

`content/docs/quickstart.mdx`:

```mdx
---
title: Quickstart
description: Kick off a generation, poll, download artifacts.
---

This walkthrough creates a generation for a brand-new site, polls until it's
done, and downloads each artifact.

## 1. Kick off a generation

```bash
curl -X POST https://make-a-llms.txt/api/v1/generations \
  -H "Authorization: Bearer mklt_pat_..." \
  -H "content-type: application/json" \
  -d '{ "name": "Acme", "rootUrl": "https://acme.test" }'
```

Response:

```json
{
  "generation": {
    "id": 42,
    "siteId": 7,
    "status": "pending",
    "trigger": "manual",
    "createdAt": "...",
    "urls": {
      "self": "https://make-a-llms.txt/api/v1/generations/42",
      "llms": ".../llms.txt",
      "llmsFull": ".../llms-full.txt",
      "pages": ".../pages"
    }
  }
}
```

## 2. Poll until ready

```bash
curl -H "Authorization: Bearer mklt_pat_..." \
  https://make-a-llms.txt/api/v1/generations/42
```

Repeat until `status` is `"succeeded"` (or `"failed"`).

## 3. Download

```bash
curl -H "Authorization: Bearer mklt_pat_..." \
  https://make-a-llms.txt/api/v1/generations/42/llms.txt
```

For per-page markdown, hit `/pages` first to see the manifest, then
`/pages/<path>` for any page.
```

- [ ] **Step 5: Build the OpenAPI doc so fumadocs can read it**

Run: `pnpm build:openapi`
Expected: `public/openapi.json` is regenerated.

- [ ] **Step 6: Boot dev server and smoke**

Run: `pnpm dev`
In a browser, visit:
- `http://localhost:3000/docs` — renders the index MDX.
- `http://localhost:3000/docs/authentication` — renders.
- `http://localhost:3000/docs/quickstart` — renders.
- `http://localhost:3000/docs/api/createGeneration` (or whatever operation slug fumadocs uses) — renders the POST operation.

If a URL 404s, check the fumadocs source/slug mapping in `node_modules/fumadocs-openapi/dist/` and adjust the route file.

Stop the dev server.

- [ ] **Step 7: Commit**

```bash
git add src/app/docs content/docs
git commit -m "feat(docs): scaffold fumadocs docs site with MDX guides and OpenAPI reference"
```

---

## Task 17 — Theme + nav link + lightweight test

**Files:**
- Modify: `src/components/layout/site-header.tsx`
- Modify: `src/components/layout/site-header.test.tsx`
- Create: `src/app/docs/docs.test.tsx`

- [ ] **Step 1: Add Docs link to the header**

Update `NAV_ITEMS` in `src/components/layout/site-header.tsx`:

```ts
const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/sites/new', label: 'Add Site' },
  { href: '/documentation', label: 'Documentation' },
  { href: '/settings/api-tokens', label: 'API Tokens' },
  { href: '/docs', label: 'API Docs' },
] as const;
```

- [ ] **Step 2: Update header test**

Open `src/components/layout/site-header.test.tsx` and add an assertion that the `API Docs` link appears with `href="/docs"`. If the existing test asserts the exact number of NAV_ITEMS, update the count. (If it doesn't, just add the assertion.)

- [ ] **Step 3: Lightweight docs smoke test**

`src/app/docs/docs.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';

describe('docs routes', () => {
  it('imports without throwing', async () => {
    await expect(import('./layout')).resolves.toBeDefined();
    await expect(import('./[[...slug]]/page')).resolves.toBeDefined();
    await expect(import('./api/[[...slug]]/page')).resolves.toBeDefined();
  });
});
```

- [ ] **Step 4: Run tests**

Run: `pnpm test src/app/docs src/components/layout/site-header.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/site-header.tsx src/components/layout/site-header.test.tsx src/app/docs/docs.test.tsx
git commit -m "feat(nav): add docs link and smoke test"
```

---

## Task 18 — End-to-end manual smoke and README pointer

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`
Expected: all tests pass. Resolve any flake before continuing.

- [ ] **Step 2: Run the build end-to-end**

Run: `pnpm build`
Expected: `build:openapi` writes `public/openapi.json`, then `next build` succeeds with no type errors. Resolve any failures.

- [ ] **Step 3: Manual end-to-end smoke against the dev server**

Start the dev server in one terminal:
```bash
pnpm dev
```

In a browser:
1. Sign in.
2. Visit `/settings/api-tokens`.
3. Click "New token", name it `smoke`, expiry 30 days, create.
4. Copy the displayed token (`mklt_pat_...`).
5. Close the dialog. Verify only the prefix is visible afterwards.

In another terminal, with `TOKEN=<copied>`:

```bash
# 1) Kick off
curl -sS -X POST http://localhost:3000/api/v1/generations \
  -H "Authorization: Bearer $TOKEN" \
  -H "content-type: application/json" \
  -d '{ "name": "Smoke", "rootUrl": "https://example.com" }' | tee /tmp/gen.json

GEN_ID=$(jq -r '.generation.id' /tmp/gen.json)

# 2) Poll
while :; do
  S=$(curl -sS -H "Authorization: Bearer $TOKEN" \
    http://localhost:3000/api/v1/generations/$GEN_ID | jq -r .status)
  echo "status: $S"
  [ "$S" = "succeeded" ] || [ "$S" = "failed" ] && break
  sleep 5
done

# 3) Download
curl -sS -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/v1/generations/$GEN_ID/llms.txt | head
curl -sS -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/v1/generations/$GEN_ID/pages | jq .pages[0]
```

Verify:
- POST returns 201 with `urls` block.
- Polling progresses (`pending` → `running` → `succeeded`).
- `llms.txt` returns text starting with a `#` heading.
- Pages manifest returns at least one page.

- [ ] **Step 4: Revoke and verify 401**

In the web UI, revoke the `smoke` token.

In the terminal:
```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/v1/generations/$GEN_ID
```

Expected: `401`.

- [ ] **Step 5: Docs smoke**

Visit:
- `http://localhost:3000/docs` — renders.
- `http://localhost:3000/docs/authentication` — renders.
- `http://localhost:3000/docs/quickstart` — renders.
- `http://localhost:3000/docs/api/...` — at least one operation renders with request/response examples.

Stop the dev server.

- [ ] **Step 6: Update README**

Open `README.md` and add a short section under existing sections:

```md
## API + Docs

A versioned public API lives at `/api/v1/*`. Authenticate with a personal
access token minted from `/settings/api-tokens` and sent as a Bearer header.

Full reference and guides at `/docs`.
```

- [ ] **Step 7: Commit**

```bash
git add README.md
git commit -m "docs(readme): point at /docs and /api/v1"
```

- [ ] **Step 8: Final tests + build**

Run: `pnpm test && pnpm build`
Expected: both green.

---

## Self-Review

**Spec coverage**

- API namespace `/api/v1`: Tasks 10–12.
- Multiple named PATs: Tasks 1–3.
- `requireApiTokenOrThrow`: Task 4.
- PAT UI: Tasks 5, 6.
- Endpoint surface (6 routes): Tasks 10–12.
- Inline-site-create preserved: covered in Task 10's POST handler.
- Curated `GenerationView`: Task 7 service layer; Task 10 GET handler.
- Zod-derived OpenAPI: Task 9 schemas; Tasks 13–14 routes/document/script.
- Polling pattern: GET status endpoint in Task 10 returns terminal-state-friendly shape.
- Fumadocs at `/docs` with MDX guides + OpenAPI: Tasks 15–17.
- Service-layer refactor: Tasks 7–8.
- Drift canary: Task 13's document test asserts all six paths present.
- Nav link: Task 17.
- `public/openapi.json` gitignored: Task 14.
- Manual smoke + README: Task 18.

All spec sections have a task. No gaps.

**Placeholder scan**

- No "TBD" / "TODO" / "implement later" in the plan.
- No "similar to Task N" — Task 11's `llms-full.txt` test is included verbatim, not by reference.
- No "add appropriate error handling" — every route's error path is explicit (401, 400, 404).
- No undefined types — `GenerationView`, `GenerationFileKind`, `ApiTokenParts`, etc. are all defined in their introducing task.

**Type and name consistency**

- `requireApiTokenOrThrow(req: Request): Promise<User>` is defined in Task 4 and used in Tasks 10–12 with the same signature.
- `getGenerationView`, `readGenerationFile`, `readPageManifest`, `readPageMarkdown` are defined in Task 7 and used unchanged in Tasks 8 and 10–12.
- `API_TOKEN_PREFIX = 'mklt_pat_'` is referenced consistently across Tasks 3, 4, and tests in Tasks 5, 10–12.
- `createGenerationV1Schema` lives in `src/lib/openapi/schemas.ts` (Task 9) and is imported by both the v1 POST route (Task 10) and the OpenAPI routes registry (Task 13).
- Drizzle table name `apiTokens` and `tokenHash` / `tokenPrefix` / `revokedAt` / `expiresAt` are spelled identically across schema, guards, internal handlers, and tests.

No issues found.
