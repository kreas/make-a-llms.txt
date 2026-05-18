# Public API + Docs — Design

**Date:** 2026-05-14
**Status:** Approved (design phase)
**Surface:** New `/api/v1/*` routes (PAT-authed) + new `/docs` site (fumadocs)
**Scope:** Expose generation creation, polling, and artifact retrieval to
authenticated programmatic consumers, and ship a documentation site that
describes the API.

## Problem

Today, every user-facing capability — kicking off a generation, polling its
status, downloading `llms.txt` / `llms-full.txt`, fetching individual page
markdown — is reachable only through the cookie-authed web UI. Existing
power users want to drive these flows from scripts, CI pipelines, and their
own tooling, but there is no programmatic access path and no documentation
describing one.

This spec adds:

1. A small, versioned public API under `/api/v1/*`, authenticated by
   personal access tokens (PATs) that users mint from their account
   settings.
2. A documentation site at `/docs`, built with fumadocs, combining
   hand-written MDX guides with an auto-rendered OpenAPI reference.

## Goals

- A logged-in user can mint a PAT in the web UI, copy it once, and use it
  as a `Bearer` token against `/api/v1/*` to drive a full generation
  lifecycle.
- The OpenAPI document at `/openapi.json` is the single source of truth
  for v1 routes and is derived from the same Zod schemas the route
  handlers use to validate, so docs and implementation cannot drift.
- `/docs` renders both MDX guides (intro, authentication, quickstart) and
  the OpenAPI reference, with a single navigation, fumadocs' built-in
  search, and styling that aligns with the marketing site.
- Internal `/api/*` routes are not broken or visibly changed for the web
  UI; they continue to use cookie auth.

## Non-Goals (v1)

- No rate limiting or abuse protection on `/api/v1/*`. Closed-alpha
  audience, accepted risk.
- No webhooks, SSE, or long-poll on the public API. Polling only.
- No public-API surface for sites CRUD, generation cancellation, audits,
  or robots-generator drafts. Site management stays web-UI only.
  (Inline-site-create via `rootUrl + name` on `POST /v1/generations` is
  preserved.)
- No billing, metering, or usage tracking.
- No token scopes — every PAT has full access to the owning user's
  resources.
- No marketing/pricing pages on the docs site.
- No OAuth, client-credentials grant, or third-party app integration.

## Decisions Locked In

| Question | Decision |
| --- | --- |
| Audience | Existing logged-in users driving their own resources programmatically. Closed alpha. |
| API namespace | New `/api/v1/*`. Internal `/api/*` remains cookie-authed. |
| Token model | Multiple named PATs per user. New `api_tokens` table. |
| Token format | `mklt_pat_<32 random bytes, base64url>`. |
| Token expiry | Optional (allow `never`). UI suggests 90 days. Revisit later. |
| Token name uniqueness | Not enforced. Revisit later. |
| Endpoint surface | Generations only: POST, GET status, llms.txt, llms-full.txt, pages manifest, single page. |
| `POST /v1/generations` body | Accepts `{ siteId }` OR `{ rootUrl, name, sitemapUrl? }`. Inline-site-create preserved. |
| Async pattern | Polling only. No webhooks/SSE on public API. |
| OpenAPI source | Derived from Zod schemas via `zod-openapi`. Built at `pnpm build` time, written to `public/openapi.json`. |
| Docs framework | fumadocs (`fumadocs-core` + `fumadocs-ui` + `fumadocs-openapi`). |
| Docs location | `/docs` route inside the existing Next.js app. |
| Service layer | New `src/lib/services/generations.ts` shared by `/api/*` and `/api/v1/*` route handlers. |
| Versioning | Document tagged `1.0.0`. Breaking changes → `/api/v2`. Non-breaking additions bump minor. |

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Next.js app (single deployment)                                │
│                                                                 │
│  /api/*           ──── cookie-session, web UI only              │
│  /api/v1/*        ──── PAT-bearer auth, public API              │
│  /docs            ──── fumadocs DocsLayout                      │
│  /docs/[[...slug]]      ──── MDX from content/docs/*.mdx        │
│  /docs/api/[[...slug]]  ──── fumadocs-openapi from openapi.json │
│  /settings/api-tokens   ──── PAT management UI                  │
│                                                                 │
│  /openapi.json    ──── served from public/, built from Zod      │
└─────────────────────────────────────────────────────────────────┘

Build-time:
  src/lib/openapi/document.ts  →  scripts/build-openapi.ts
                               →  public/openapi.json
                               →  fumadocs reads at next build
```

### Module layout (new files)

```
src/lib/tokens/
  index.ts                  # generic primitives (random, hash, prefix)
  api-token.ts              # createApiToken, verifyApiToken
  webhook-token.ts          # re-exports legacy helpers from new primitives
  *.test.ts

src/lib/auth-guards.ts      # MODIFIED: + requireApiTokenOrThrow(req)

src/lib/services/
  generations.ts            # shared service layer
  generations.test.ts

src/lib/openapi/
  schemas.ts                # Zod schemas with .openapi() metadata
  routes.ts                 # route descriptors (method, path, body, responses)
  document.ts               # buildOpenApiDocument() composer
  document.test.ts          # drift canary

scripts/
  build-openapi.ts          # writes public/openapi.json

src/app/api/v1/
  generations/
    route.ts                # POST kick off
    [id]/
      route.ts              # GET status (curated)
      llms.txt/route.ts
      llms-full.txt/route.ts
      pages/route.ts        # manifest
      pages/[...path]/route.ts
    (route.test.ts beside each)

src/app/settings/api-tokens/
  page.tsx                  # server component (auth + initial data)
  ApiTokensClient.tsx       # TanStack Query list/create/revoke
  CreateTokenDialog.tsx     # one-time-display modal
  *.test.tsx

src/app/api/api-tokens/     # internal cookie-authed endpoints for the UI
  route.ts                  # GET (list), POST (create)
  [id]/route.ts             # DELETE (revoke)

src/app/docs/
  layout.tsx                # fumadocs DocsLayout
  [[...slug]]/page.tsx      # MDX renderer
  api/[[...slug]]/page.tsx  # fumadocs-openapi renderer

src/lib/docs/
  source.ts                 # fumadocs source adapter
  openapi.ts                # fumadocs-openapi instance

content/docs/
  index.mdx
  authentication.mdx
  quickstart.mdx
  meta.json

source.config.ts            # fumadocs MDX config (repo root)
```

### Files modified

- `src/db/schema.ts` — adds `apiTokens` table + types.
- `drizzle/00xx_<name>.sql` — generated migration for `api_tokens`.
- `src/lib/webhook-token.ts` — re-exports from `src/lib/tokens/` (no
  behavior change for existing callers).
- `src/app/api/generations/route.ts`,
  `src/app/api/generations/[id]/route.ts`,
  `src/app/api/generations/[id]/files/[kind]/route.ts`,
  `src/app/api/generations/[id]/pages/route.ts`,
  `src/app/api/generations/[id]/pages/[...path]/route.ts` — bodies
  replaced with thin calls into `src/lib/services/generations.ts`.
  Response shapes unchanged.
- `src/components/nav/*` (existing nav component) — add a Docs link.
- `package.json` — `build` script chains `pnpm build:openapi` before
  `next build`. New deps: `zod-openapi`, `fumadocs-core`, `fumadocs-ui`,
  `fumadocs-openapi`.
- `.gitignore` — `public/openapi.json`.
- `.env.example` — no new keys required (PATs are DB-only;
  `PUBLIC_BASE_URL` already exists and is used to set the OpenAPI
  `servers[0].url`).

## Components

### `api_tokens` table

```ts
export const apiTokens = sqliteTable('api_tokens', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  tokenPrefix: text('token_prefix').notNull(),
  lastUsedAt: text('last_used_at'),
  expiresAt: text('expires_at'),
  revokedAt: text('revoked_at'),
  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
}, (t) => ({
  byUser: index('api_tokens_by_user').on(t.userId),
}));
```

- `tokenHash` is SHA-256 of the full token, base64url-encoded.
- `tokenPrefix` is the first 12 characters of the full token (after the
  `mklt_pat_` prefix), shown in the UI for identification.
- `revokedAt` is a soft delete — preserves audit visibility of past
  tokens.

### Token primitives (`src/lib/tokens/`)

`index.ts` exposes three pure helpers:

```ts
generateTokenSecret(byteLength = 32): string   // base64url
hashTokenSecret(secret: string): string        // sha256, base64url
tokenPrefix(token: string, length = 12): string
```

`api-token.ts` builds on those:

```ts
createApiToken(): { token: string; hash: string; prefix: string }
// token format: `mklt_pat_<base64url>`

verifyApiToken(rawToken: string, hash: string): boolean
```

`webhook-token.ts` is unchanged in interface — its implementation
delegates to the primitives.

### `requireApiTokenOrThrow`

```ts
export async function requireApiTokenOrThrow(req: Request): Promise<User>
```

Behavior:
1. Read `Authorization` header. If missing or not `Bearer mklt_pat_...`,
   throw `ApiError(401, 'unauthenticated', 'Invalid or missing API token')`.
2. Compute `hashTokenSecret(rawToken)`. Look up by `tokenHash`.
3. If no row, or `revokedAt IS NOT NULL`, or `expiresAt < now`, throw
   `ApiError(401, ...)` with the same generic message.
4. Load owning user. If user doesn't exist (shouldn't happen due to FK),
   throw 401.
5. Fire-and-forget update of `lastUsedAt` to current timestamp (do not
   await; do not block the request).
6. Return the user row.

The error message is intentionally the same for all failure modes (no
information oracle for token enumeration).

### Service layer (`src/lib/services/generations.ts`)

```ts
export type GenerationView = {
  id: number;
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled';
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
): Promise<GenerationView>;

export async function readGenerationFile(
  generationId: number,
  userId: number,
  kind: 'llms' | 'llms-full',
): Promise<{ stream: ReadableStream; filename: string }>;

export async function readPageManifest(
  generationId: number,
  userId: number,
): Promise<{
  status: PagesStatus;
  count: number;
  pages: Array<{ path: string; status: 'ok' | 'error' | 'skipped'; bytes?: number }>;
}>;

export async function readPageMarkdown(
  generationId: number,
  userId: number,
  path: string,
): Promise<ReadableStream>;
```

All four functions perform ownership checks via `assertOwnsGeneration`
and throw `ApiError(404, 'not_found', ...)` if the resource is missing.

The route handlers — both internal and v1 — become thin wrappers:
they read params, call the service, and shape the HTTP response (URLs
in JSON for v1; raw rows or download headers for the internal UI).

### `/api/v1/*` route handlers

Six handlers, all importing schemas from `src/lib/openapi/schemas.ts` and
delegating logic to `src/lib/services/generations.ts`.

**`POST /api/v1/generations`**

```ts
const user = await requireApiTokenOrThrow(req);
const body = createGenerationV1Schema.parse(await req.json());
// Reuses existing enqueueGenerationsForSite + inline-site-create path.
const generation = await createGeneration(body, user.id);
return Response.json({ generation: toGenerationCreatedView(generation, baseUrl) }, { status: 201 });
```

The `urls` block in the response is composed from the request's origin
(or `PUBLIC_BASE_URL` if needed for absolute URLs).

**`GET /api/v1/generations/{id}`**

```ts
const user = await requireApiTokenOrThrow(req);
const view = await getGenerationView(Number(id), user.id);
return Response.json(injectUrls(view, baseUrl, id));
```

`files.*.url` is added when `files.*.ready === true`.

**`GET /api/v1/generations/{id}/llms.txt`**, **`/llms-full.txt`**

Streams the blob with `content-type: text/plain; charset=utf-8` and
`content-disposition: attachment; filename="llms.txt"` (or
`llms-full.txt`). 404 with `code: 'not_ready'` if blob path is null.

**`GET /api/v1/generations/{id}/pages`**

Returns the manifest with per-page `url` fields added.

**`GET /api/v1/generations/{id}/pages/{...path}`**

Streams the page markdown with `content-type: text/markdown; charset=utf-8`
and `content-disposition: inline`.

### OpenAPI registry

`src/lib/openapi/schemas.ts` defines:

- `createGenerationV1Schema` (request body, discriminated union of
  `siteId` form vs `rootUrl` form)
- `generationCreatedSchema` (POST response)
- `generationViewSchema` (GET status response)
- `pageManifestSchema`
- `errorSchema` (`{ error: { code, message } }`)
- `pagesStatusEnum`, `summariesStatusEnum`, `generationStatusEnum`

Each is `.openapi({ ref: '...' })`-tagged so they appear in
`components.schemas` rather than inlined.

`src/lib/openapi/routes.ts` defines one record per route:

```ts
export const generationsCreateRoute = {
  method: 'post',
  path: '/generations',
  summary: 'Kick off a generation',
  tags: ['generations'],
  requestBody: { schema: createGenerationV1Schema },
  responses: {
    201: { description: 'Created', schema: generationCreatedSchema },
    400: { description: 'Validation error', schema: errorSchema },
    401: { description: 'Unauthenticated', schema: errorSchema },
    404: { description: 'Site not found', schema: errorSchema },
  },
} as const;
```

`src/lib/openapi/document.ts` composes `info`, `servers`, `security`,
and all routes into a single OpenAPI 3.1 document via `zod-openapi`'s
`createDocument()`.

### Build script

`scripts/build-openapi.ts` is a small Node script:

```ts
import { writeFileSync } from 'node:fs';
import { buildOpenApiDocument } from '../src/lib/openapi/document';

const doc = buildOpenApiDocument({ publicBaseUrl: process.env.PUBLIC_BASE_URL });
writeFileSync('public/openapi.json', JSON.stringify(doc, null, 2));
console.log('Wrote public/openapi.json');
```

Wired into `package.json`:

```json
{
  "scripts": {
    "build:openapi": "tsx scripts/build-openapi.ts",
    "build": "pnpm build:openapi && next build"
  }
}
```

### PAT management UI

**Route:** `/settings/api-tokens` (server component for auth gate; client
component for the interactive list).

**API (internal, cookie-authed):**

- `GET /api/api-tokens` — list of `{ id, name, tokenPrefix, lastUsedAt,
  expiresAt, revokedAt, createdAt }` for the current user.
- `POST /api/api-tokens` — body: `{ name, expiresInDays?: number }`.
  Returns `{ token: 'mklt_pat_...', record: {...} }`. **`token` is
  returned exactly once.**
- `DELETE /api/api-tokens/{id}` — sets `revokedAt`.

**UI:**

- Table of tokens with name, prefix (truncated), last used, status.
- "Create token" button → modal with `name` input and an expiry
  dropdown (30 / 90 / 365 days / never; default 90).
- On create: full token displayed once in a copy-to-clipboard field with
  a clear warning that it won't be shown again. Dismissing the modal
  reveals only the prefix.
- Revoke button per row with confirm.

### Fumadocs setup

- `source.config.ts` at repo root configures the MDX source pointing at
  `content/docs/`.
- `src/lib/docs/source.ts` exports the fumadocs source adapter.
- `src/lib/docs/openapi.ts` configures `fumadocs-openapi` to read
  `public/openapi.json`.
- `src/app/docs/layout.tsx` uses `DocsLayout` from `fumadocs-ui/layouts/docs`
  with a sidebar that lists both Guides and API Reference.
- `src/app/docs/[[...slug]]/page.tsx` renders MDX pages from the source.
- `src/app/docs/api/[[...slug]]/page.tsx` renders OpenAPI operations.

**Initial MDX content:**

- `index.mdx` — what the API is, who it's for, links to authentication
  and quickstart.
- `authentication.mdx` — minting a PAT, sending it as `Bearer`, when to
  rotate, what 401 means.
- `quickstart.mdx` — a single shell session that creates a generation,
  polls until ready, downloads `llms.txt`, fetches one page.

**Theme:** fumadocs' CSS variables remapped to DESIGN.md tokens in the
docs layout so colors and fonts match the marketing site.

## Data flow

### Generation lifecycle (programmatic)

```
Client                                     Server
  │                                          │
  │ POST /api/v1/generations                 │
  │   Authorization: Bearer mklt_pat_...     │
  │   { rootUrl, name }   or   { siteId }    │
  ├─────────────────────────────────────────▶│
  │                                          │ requireApiTokenOrThrow
  │                                          │ enqueueGenerationsForSite
  │  201 { generation: { id, status, urls }} │
  │◀─────────────────────────────────────────┤
  │                                          │
  │ GET /api/v1/generations/{id}             │ ── repeat until status terminal
  │◀─────────────────────────────────────────│
  │   { status: 'running', files: {...} }    │
  │                                          │
  │ GET /api/v1/generations/{id}/llms.txt    │
  │◀─────────────────────────────────────────│
  │   text/plain stream                      │
```

### OpenAPI build

```
src/lib/openapi/schemas.ts ─┐
src/lib/openapi/routes.ts ──┼─► src/lib/openapi/document.ts
                            │      └─► buildOpenApiDocument()
                            └─►   ─┘
                                   │
scripts/build-openapi.ts ──────────┘
   └─► public/openapi.json
            │
            └─► fumadocs-openapi (at next build) ─► /docs/api/*
```

## Error handling

- All `/api/v1/*` errors use the shared `{ error: { code, message } }`
  shape from `apiErrorResponse`.
- Standard codes:
  - `validation` — 400, request body fails Zod parse.
  - `unauthenticated` — 401, generic message for all token failures
    (missing, malformed, unknown, revoked, expired).
  - `not_found` — 404, generation not owned or not found, blob missing.
  - `not_ready` — 404, generation exists but the requested artifact
    hasn't been produced yet.
  - `site_exists` — 409, inline create attempted for a URL the user
    already has.
  - `internal` — 500, anything else.

- The `lastUsedAt` update is best-effort. If it fails (e.g., DB write
  contention), the request still succeeds.

- Blob-not-found on a manifest-claimed page returns 404 with
  `code: 'not_found'`, not 500. The manifest can lag.

## Testing strategy

- **Token primitives:** unit tests in `src/lib/tokens/*.test.ts` covering
  format, hashing determinism, prefix length, round-trip.
- **`requireApiTokenOrThrow`:** tests in `auth-guards.test.ts` for
  missing/malformed header, unknown hash, revoked, expired, valid
  (returns user, fires `lastUsedAt` update).
- **Service layer:** `generations.test.ts` exercises each function with
  DB fixtures and blob stubs. Asserts curated shape, ownership
  enforcement, blob-missing behavior.
- **v1 route handlers:** per-route `route.test.ts` files. Each covers
  401 (no/bad token), 404 (not-owned), and happy path with shape
  asserted via the same Zod schema used in the handler.
- **OpenAPI build:** `document.test.ts` imports `buildOpenApiDocument`
  and asserts `info.version === '1.0.0'`, all six paths present,
  every operation has `security: [{ bearerAuth: [] }]`, resolves
  without throwing.
- **PAT management UI:** RTL tests for list, create (verifies token
  shown once), revoke confirm flow. Uses the project's existing
  TanStack Query test wrapper.
- **Docs site:** light smoke test — one snapshot test asserting the
  docs route resolves without error. Detailed rendering is fumadocs'
  responsibility.
- **End-to-end manual smoke (documented in the plan):** create PAT →
  POST generation → poll → download artifacts → revoke → confirm 401.

## Rollout

Phases ship sequentially. Each merges to main; no long-lived branches.

1. **Foundation** — `api_tokens` table + migration, token primitives,
   `requireApiTokenOrThrow`, PAT management UI + internal endpoints.
2. **Service layer** — extract `src/lib/services/generations.ts` from
   the existing internal handlers; migrate handlers to call it. No
   external behavior change.
3. **Public API routes** — six `/api/v1/*` handlers + their tests.
   Schemas defined in `src/lib/openapi/schemas.ts` (route descriptors
   come in phase 4, but the schemas themselves are usable now).
4. **OpenAPI build pipeline** — `src/lib/openapi/routes.ts`,
   `document.ts`, `scripts/build-openapi.ts`, drift canary test,
   wired into `package.json`'s `build`. `public/openapi.json`
   gitignored.
5. **Fumadocs** — install packages, scaffold `source.config.ts`,
   `src/app/docs/*`, `content/docs/*`, theme override, nav link.
6. **End-to-end smoke + light README addition.**

## Open questions deferred to later

- Token expiry policy (required vs optional vs default).
- Token name uniqueness.
- Rate limiting / abuse protection.
- Webhook callbacks for generation completion.
- Sites CRUD and cancel on the public API.
- Token scopes (currently full-access only).
- Billing / metering.
