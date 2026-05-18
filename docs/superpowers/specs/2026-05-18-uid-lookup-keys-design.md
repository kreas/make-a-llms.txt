# UID lookup keys

**Status:** Approved (design phase)
**Date:** 2026-05-18
**Branch:** `feat/uid-lookup-keys`

## Problem

Today every resource — sites, generations, API tokens, etc. — is addressed in URLs and API paths by its sequential numeric primary key (`/sites/42`, `/api/v1/generations/17`). Even though every route currently scopes lookups by `userId`, the sequential IDs are an open enumeration surface: any missed `userId` check on a single endpoint would let a signed-in user view another user's resources by incrementing or decrementing an integer. We want to eliminate that risk class entirely by switching to opaque, unguessable identifiers for all external addressing.

## Goal

- Add an opaque, unguessable `uid` (UUIDv4) to every table.
- Use the `uid` as the external lookup key in every dashboard URL, internal API route, public v1 API route, OpenAPI doc, and JSON response.
- Keep numeric `id` purely internal: PK, foreign keys, joins — never leaves the server.
- Close the enumeration risk class without introducing a new "two IDs to track" mental model for external consumers.

## Non-goals

- We are not changing primary keys or foreign keys to UUIDs. Joins keep using the numeric `id` for performance and migration simplicity.
- We are not preserving old numeric URLs. Hard swap; old links 404.
- We are not changing authentication, authorization, or session shape (cookies still reference the numeric user PK internally; `users.uid` exists but is not yet used externally).

## Decisions

| Question | Decision |
|---|---|
| Which tables get a UID? | All of them: `users`, `otp_codes`, `sites`, `generations`, `crawler_audits`, `robots_generator_drafts`, `api_tokens`. |
| UID format | UUIDv4, generated with the Node built-in `crypto.randomUUID()`. No external dependency. |
| v1 public API | UID only. Numeric IDs not accepted. |
| Internal API + dashboard URLs | UID only. Hard swap. No redirects. |
| JSON response shape | The public `id` field becomes a UUID string. The numeric PK is never serialised. |
| Foreign keys | Stay on the numeric PK. Only response payloads are remapped to expose the *related row's UID*. |
| Backfill | Migration adds `uid` nullable, backfills every existing row with `crypto.randomUUID()`, then adds a `UNIQUE` index. |

## Schema changes

Every table in `src/db/schema.ts` gets:

```ts
uid: text('uid').notNull().unique().$defaultFn(() => crypto.randomUUID()),
```

Drizzle emits a unique index `<table>_uid_unique` per table. The Drizzle-level `notNull()` is the application-side guarantee (every ORM insert auto-fills it); the DB-level guarantee is `UNIQUE`. SQLite cannot retroactively `ALTER COLUMN ... SET NOT NULL` without a table rebuild, so we accept that compromise. Inserts that bypass the ORM are not a real-world concern in this codebase.

## Migration (`drizzle/0008_add_uid.sql`)

For each of the seven tables, in one migration file:

1. `ALTER TABLE <t> ADD COLUMN uid TEXT;` (nullable, so existing rows are valid mid-migration)
2. Backfill — performed in a TypeScript migration runner step (`pnpm db:migrate` already supports Drizzle's journal; we'll add a small post-SQL step that loops `SELECT id FROM <t> WHERE uid IS NULL` and updates each with `crypto.randomUUID()`). SQLite does not have a built-in UUID generator, so the loop runs in app code.
3. `CREATE UNIQUE INDEX <t>_uid_unique ON <t>(uid);`

The migration is idempotent: re-running the backfill is a no-op once every row has a `uid`.

## Application-layer module: `src/lib/uid.ts`

```ts
import { z } from 'zod';

export function generateUid(): string {
  return crypto.randomUUID();
}

export const uidSchema = z.string().uuid();

export function parseUid(value: unknown): string {
  return uidSchema.parse(value);
}
```

Route handlers call `parseUid(params.id)` and let the zod failure path return a 400 (existing error-handling middleware turns parse errors into HTTP 400s).

## Service layer

A new `src/lib/services/sites.ts` parallels the existing `src/lib/services/generations.ts`. Both services expose:

- `findByUidForUser(uid: string, userId: number): Promise<Row | null>` — the only lookup helper route handlers may use. Scoped by `userId` in the same query.
- `toPublic(row): PublicDTO` — maps a DB row into the response shape (see below). When the row references other tables (e.g., a generation references a site), `toPublic` is responsible for joining and emitting the related row's `uid`, not its numeric id.

Existing helpers that take a numeric `id` are renamed or removed. There is no fallback path that accepts a numeric id from request input.

## Public DTOs

A new file `src/lib/types/public.ts` defines the public response shapes:

```ts
export type SitePublic = {
  id: string;            // site.uid
  name: string;
  rootUrl: string;
  // ...
};

export type GenerationPublic = {
  id: string;            // generation.uid
  siteId: string;        // site.uid
  status: GenerationStatus;
  // ...
};

export type ApiTokenPublic = {
  id: string;            // api_token.uid
  name: string;
  tokenPrefix: string;
  lastUsedAt: string | null;
  // ...
};
```

The DB-row types exported by `src/db/schema.ts` (`Site`, `Generation`, `ApiToken`, etc.) remain internal — they still have `id: number`. Dashboard and client code import the `*Public` types from `src/lib/types/public.ts`.

## Route changes

All affected `[id]` and `[siteId]` segments retain their param name (so we don't touch every `params.id` reference) but now carry a UUID string.

**Dashboard pages:**
- `src/app/(app)/sites/[id]/page.tsx`
- `src/app/(app)/g/[id]/page.tsx`

**Internal API (under `src/app/api/`):**
- `sites/[id]/route.ts` and children: `audits`, `audits/latest`, `generator-draft`, `rotate-token`
- `generations/[id]/*` including `cancel`, `files/[kind]`, `pages`, `pages.zip`, `pages/[...path]`, `stream`
- `api-tokens/[id]/route.ts`
- `webhooks/sites/[siteId]/regenerate/route.ts`

**Public v1 API (under `src/app/api/v1/`):**
- `generations/[id]/route.ts`
- `generations/[id]/cancel`
- `generations/[id]/llms.txt`
- `generations/[id]/llms-full.txt`
- `generations/[id]/pages`
- `generations/[id]/pages.zip`
- `generations/[id]/pages/[...path]`

Every handler's first step is `const uid = parseUid(params.id);` followed by a service-layer lookup that joins on `{ uid, userId: session.userId }`.

## Dashboard updates

Because the JSON contract keeps the field named `id` (just with UUID values), most JSX (`<Link href={`/g/${gen.id}`}>`, `gen.id` lookups in lists) continues to work unchanged. The substantive changes are:

- `src/app/(app)/dashboard/*` — type imports switch from DB-row types to public DTOs.
- `src/app/(app)/sites/page.tsx` — site list cards link to `/sites/{uid}` (no template change, just contract).
- `src/app/(app)/sites/[id]/*` client components — TanStack Query keys become UID strings (already strings, no behavioural change).
- `src/app/(app)/settings/api-tokens/api-tokens-client.tsx` — delete-token mutation hits `/api/api-tokens/{uid}`.

## OpenAPI / docs updates

- `src/lib/openapi/schemas.ts` — every `id` field changes from `z.number().int()` to `z.string().uuid()`.
- The example payloads in OpenAPI route definitions update to UUID samples.
- `content/docs/quickstart.mdx` and `content/docs/authentication.mdx` — any inline example using a numeric id swaps to a UUID example.
- `/docs/api` regenerates automatically from the updated schemas.

## Webhook tokens

The webhook route `src/app/api/webhooks/sites/[siteId]/regenerate/route.ts` currently looks up the site by numeric `siteId` and then validates a separate token header. The route's `[siteId]` segment becomes the site's UID. Token verification logic does not change.

## Tests

- **`src/lib/uid.test.ts`** — `generateUid()` returns a valid UUIDv4; `parseUid()` accepts valid UUIDs and throws on garbage.
- **`src/lib/services/generations.test.ts`** and **new `sites.test.ts`**:
  - `findByUidForUser` returns the row when the user owns it.
  - Returns `null` when a different user owns the row (cross-tenant guard).
  - Returns `null` for an unknown UID.
- **Route regression tests** — per resource, two new cases:
  - `GET /<route>/not-a-uuid` → 400 (proves the parse gate is closed).
  - `GET /<route>/<uuid-owned-by-another-user>` → 404 (proves scoping holds; this is the *enumeration* test).
- **Existing route tests** — every test under `src/app/api/**/*.test.ts` and `src/app/api/v1/**/*.test.ts` updates fixture seeding to insert UIDs and pass UID strings as path params.
- **OpenAPI** — `src/lib/openapi/schemas.test.ts` updates expectations to `string`/`uuid` for id fields.

## Verification

Before reporting the work complete: `pnpm test`, `pnpm build`, `pnpm lint` all clean. Manually in `pnpm dev`: sign in, create a site, kick off a generation; confirm `/sites/{uuid}` and `/g/{uuid}` resolve, the URL bar shows a UUID, and `/sites/1` 404s.

## Out-of-scope follow-ups

- Migrating session cookies to reference `users.uid` instead of `users.id`. Today sessions use the numeric PK internally; this is not enumerable (cookies are signed) and a swap can happen later without API impact.
- Removing the numeric `id` column entirely. Not planned — it remains the PK and FK target.
