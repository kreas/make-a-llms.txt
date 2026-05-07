# make-a-llms.txt — Design Spec

**Date:** 2026-05-07
**Status:** Approved for planning

## 1. Summary

A signed-in web app that generates `llms.txt` and `llms-full.txt` for a user's website. Generation is driven by the existing `llmstxt` npm package (`gen` / `gen-full` subcommands) invoked from the server. Users register one or more **sites**; every generation belongs to a site. Each site exposes a token-authed webhook URL the user can POST to (e.g., from a deploy hook) to regenerate. On completion, users get a Resend email with a link to the generation page where they can download both files.

The build sits on the existing AI starter pack — Next.js 16 App Router, Drizzle + Turso, Vercel Blob, OTP auth — and adds Vercel Workflow (WDK) for durable execution.

## 2. Decisions Locked During Brainstorming

| Decision | Choice |
|---|---|
| What gets generated | `llms.txt` + `llms-full.txt` |
| Generation engine | The `llmstxt` npm package (installed as a dependency, not run via `npx`) |
| Crawl scope | Sitemap-driven; the package handles it |
| Auth | Sign-in required (existing OTP flow kept) |
| Persistence | Save every generation per user |
| Background jobs | Vercel Workflow (WDK) |
| App shape | Dashboard + detail pages |
| Input format | Smart input — accepts a website root or a sitemap URL |
| File delivery | Download only (private Vercel Blob, proxied) |
| Quotas | None in v1; one-active-job-per-site guard |
| Webhook | Token-authed, regenerates both files, always notifies via email |
| Notification | Resend email with link to generation page |

## 3. Architecture

```
                ┌──────────────────────────┐
   Browser ─►   │  Next.js (App Router)    │
                │  /dashboard, /sites/[id], │
                │  /g/[id]                  │
                │  TanStack Query + SSE     │
                └────────────┬─────────────┘
                             │ JSON / SSE
                             ▼
                ┌──────────────────────────┐
                │  /api/sites/*             │
                │  /api/generations/*       │
                │  /api/webhooks/sites/[id] │
                └────────────┬─────────────┘
                             │
                             ▼ trigger
                ┌──────────────────────────┐
                │ Vercel Workflow (WDK)    │
                │   prepare → runGen ║      │
                │   prepare → runFull ║     │
                │              ↓ join       │
                │           complete        │
                │              ↓            │
                │           notify          │
                └────────────┬─────────────┘
                             ▼
                ┌──────────────────────────┐
                │  Vercel Blob (private)   │
                │  Turso (Drizzle)         │
                │  Resend (email)          │
                └──────────────────────────┘
```

**New files added on top of the starter pack:**

- `src/db/schema.ts` — extends with `sites`, `generations` tables.
- `src/app/api/sites/` — sites CRUD + token rotate.
- `src/app/api/generations/` — list, detail, SSE stream, file proxy, cancel.
- `src/app/api/webhooks/sites/[siteId]/regenerate/route.ts` — public token-auth.
- `src/lib/llmstxt.ts` — wraps `execa('llmstxt', …)`, streams stdout to Blob.
- `src/lib/sitemap-discover.ts` — root-URL → sitemap autodiscovery.
- `src/lib/webhook-token.ts` — generate / hash / verify / prefix.
- `src/lib/auth-guards.ts` — `requireUser`, ownership helpers.
- `src/lib/workflow/generate-site-files.ts` — WDK workflow definition.
- `src/lib/enqueue-generations.ts` — single helper used by both manual and webhook entry points.
- `src/app/(app)/dashboard/page.tsx` — site list.
- `src/app/(app)/sites/new/page.tsx` — new site form.
- `src/app/(app)/sites/[id]/page.tsx` — site detail with webhook block + history.
- `src/app/(app)/g/[id]/page.tsx` — generation detail with live status.
- `src/app/(app)/layout.tsx` — `requireUser()` gate for auth-protected routes.
- `src/components/sites/*`, `src/components/generations/*` — UI primitives listed in §6.

**Removed from the starter pack:**

- `src/app/api/chat/` — AI chat scaffold is unrelated to this product.

## 4. Data Model

Two new tables. Existing `users` and `otp_codes` tables are unchanged.

```ts
// src/db/schema.ts (additions)

export const sites = sqliteTable('sites', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),                          // friendly label
  rootUrl: text('root_url').notNull(),                   // normalized origin
  sitemapUrl: text('sitemap_url'),                       // null → autodiscover each run
  webhookTokenHash: text('webhook_token_hash').notNull().unique(),
  webhookTokenPrefix: text('webhook_token_prefix').notNull(), // first 8 chars for display
  lastGeneratedAt: text('last_generated_at'),
  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
  updatedAt: text('updated_at').notNull().default(sql`(current_timestamp)`),
}, (t) => ({
  uniqueUserRoot: unique().on(t.userId, t.rootUrl),
}));

export const generations = sqliteTable('generations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  siteId: integer('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }), // denormalized for authz
  status: text('status', { enum: ['pending', 'running', 'succeeded', 'failed', 'cancelled'] }).notNull().default('pending'),
  trigger: text('trigger', { enum: ['manual', 'webhook'] }).notNull(),
  notifyEmail: integer('notify_email', { mode: 'boolean' }).notNull().default(false),
  notifiedAt: text('notified_at'),                       // for idempotent re-notify on resume
  workflowRunId: text('workflow_run_id'),                // WDK run id
  resolvedSitemapUrl: text('resolved_sitemap_url'),      // what we actually crawled
  llmsBlobPath: text('llms_blob_path'),                  // gens/<id>/llms.txt
  llmsFullBlobPath: text('llms_full_blob_path'),         // gens/<id>/llms-full.txt
  errorMessage: text('error_message'),
  startedAt: text('started_at'),
  completedAt: text('completed_at'),
  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
  updatedAt: text('updated_at').notNull().default(sql`(current_timestamp)`),
}, (t) => ({
  bySiteRecent: index('gen_by_site_recent').on(t.siteId, t.createdAt),
}));
```

**Modeling notes:**

- `userId` denormalized on `generations` so authz on detail/download routes is one-table.
- One-active-job-per-site is enforced in app code via a transactional check on insert (SQLite single-writer makes this safe).
- Blob is **private**; we store paths only and proxy downloads through an authed route.
- `webhookTokenHash` is `sha256(token)`. The raw token is shown once at creation/rotation.
- `notifiedAt` exists so the workflow's `notify` step is safe across resume — set after a successful Resend call; skip if already set.
- Timestamps are ISO text (matches existing `users.createdAt`); ISO 8601 sorts lexicographically as expected.

## 5. API Surface

All authenticated routes go through `requireUser()`. Ownership checks use `userId` directly on `sites` / `generations` (no joins for authz). Inputs validated with Zod. Errors return `{ error: { code, message } }`.

### Sites — auth required, owner-only

| Method | Path | Body / Query | Returns |
|---|---|---|---|
| `POST` | `/api/sites` | `{ name, rootUrl, sitemapUrl? }` | `201 { site, webhookToken }` (token shown **once**) |
| `GET` | `/api/sites` | — | `200 { sites: Site[] }` |
| `GET` | `/api/sites/[id]` | — | `200 { site }` |
| `PATCH` | `/api/sites/[id]` | `{ name?, sitemapUrl? }` | `200 { site }` |
| `DELETE` | `/api/sites/[id]` | — | `204` (cascades to generations + blobs via cron) |
| `POST` | `/api/sites/[id]/rotate-token` | — | `200 { webhookToken }` |

### Generations — auth required, owner-only

| Method | Path | Body / Query | Returns |
|---|---|---|---|
| `POST` | `/api/generations` | `{ siteId, notifyEmail? } \| { name, rootUrl, sitemapUrl?, notifyEmail? }` | `201 { generation }` (or `202 { generation }` on dedupe) |
| `GET` | `/api/generations` | `?siteId=` | `200 { generations: Generation[] }` |
| `GET` | `/api/generations/[id]` | — | `200 { generation, downloads: { llms?: string, llmsFull?: string } }` (URLs are our proxy paths) |
| `GET` | `/api/generations/[id]/stream` | — | **SSE** of status events until terminal |
| `GET` | `/api/generations/[id]/files/[kind]` | `kind ∈ {llms, llms-full}` | `text/plain` streamed from Blob |
| `POST` | `/api/generations/[id]/cancel` | — | `200 { generation }` (best-effort WDK cancel) |

### Webhook — public, token-authed

| Method | Path | Auth | Body | Returns |
|---|---|---|---|---|
| `POST` | `/api/webhooks/sites/[siteId]/regenerate` | `Authorization: Bearer <token>` | `{}` only — `notify` field is silently ignored | `202 { generation }` (or `202 { generation }` + `X-Dedup: hit`) |

### Convergence helper

Both `POST /api/generations` and the webhook route call:

```ts
enqueueGenerationsForSite(siteId, opts: {
  trigger: 'manual' | 'webhook';
  notifyEmail?: boolean; // forced true when trigger==='webhook'
}): Promise<Generation>
```

The helper owns dedupe (transactional check), inserts the row, and triggers the WDK workflow with the new generation id. The webhook route forces `notifyEmail = true`; manual defaults to `false`.

## 6. UI & Pages

Auth-gated routes live in a route group `(app)/` whose `layout.tsx` calls `requireUser()` and redirects to `/signin?next=...` on miss. Public routes (`/`, `/signin`, `/signup`) stay at the root.

| Path | Auth | Purpose |
|---|---|---|
| `/` | Public | Landing — replace "AI Starter Pack" copy with a tight pitch for the tool, two CTAs (sign in / sign up). One pass over `src/app/page.tsx`. |
| `/signin`, `/signup` | Public | Existing OTP flows, unchanged. |
| `/(app)/dashboard` | User | List of the user's sites; "New site" CTA. Empty state: "Add your first site." |
| `/(app)/sites/new` | User | Form: name, root URL, optional sitemap URL. On submit → create site → redirect to `/sites/[id]` with the **token shown once** in a copyable, dismissible banner. |
| `/(app)/sites/[id]` | User (owner) | Site detail: rename, sitemap URL, webhook URL block (masked token + "rotate"), "Regenerate" CTA, generations table (last 20). |
| `/(app)/g/[id]` | User (owner) | Generation detail with live status (SSE), progress, downloads when ready, error message on fail, "Retry" on fail/cancel. |

**Components (`src/components/`):**

- `sites/SiteForm.tsx` — controlled form, Zod resolver; used on `/sites/new` and inline rename.
- `sites/SitesList.tsx` — cards with last-generated, status dot, inline regenerate.
- `sites/WebhookBlock.tsx` — masked-token row, "Rotate" button, copy-on-click; receives `freshToken?` for one-time post-creation reveal.
- `generations/StatusBadge.tsx` — chip per the mapping below.
- `generations/GenerationDetailCard.tsx` — live status, two download buttons (disabled until each blob path is set), error block on fail, retry CTA.
- `generations/GenerationsTable.tsx` — last N for a site.
- `generations/RegenerateButton.tsx` — popover with "Email me when done" toggle, calls `POST /api/generations`, redirects to detail page.

**Status badge mapping (uses DESIGN.md semantic tokens — never timeline pastels):**

| Status | Treatment |
|---|---|
| `pending` | `bg-surface-strong text-muted-strong`, `caption-uppercase` — grey pill |
| `running` | `bg-canvas-soft text-ink` + pulsing 6px ink dot — quiet, animated |
| `succeeded` | `bg-semantic-success text-canvas`, `caption-uppercase` — green pill |
| `failed` | `bg-destructive text-canvas`, `caption-uppercase` (`--destructive` already wired) |
| `cancelled` | `bg-surface-strong text-muted-soft`, italic "Cancelled" inline — not a pill |

Timeline pastels are explicitly **excluded** here per DESIGN.md "Don't" #4: they are scoped to in-product agent-action timelines only.

**Tailwind theme bridge — one line to add to `src/app/globals.css`:**

```css
--color-semantic-success: var(--semantic-success);
```

This exposes `bg-semantic-success` / `text-semantic-success`. `--destructive` is already bridged via the shadcn semantic block.

**Data fetching.** Per CLAUDE.md, all client-side reads/writes go through TanStack Query. SSE updates feed `queryClient.setQueryData(['generation', id], ...)` so manual reads stay consistent with the live stream.

## 7. Workflow Design (WDK)

One workflow, parallel inner steps so the fast `gen` finishes ~5s after kickoff and `gen-full` continues durably.

```
                    ┌─────────────┐
                    │  prepare    │  load row, autodiscover sitemap, status→running
                    └──────┬──────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
        ┌───────────┐             ┌────────────┐
        │  runGen   │             │  runFull   │   parallel
        │  (~5s)    │             │  (slow)    │
        └─────┬─────┘             └──────┬─────┘
              │                          │
              └────────────┬─────────────┘
                           ▼
                    ┌─────────────┐
                    │  complete   │  status + blob paths + sites.lastGeneratedAt
                    └──────┬──────┘
                           ▼
                    ┌─────────────┐
                    │  notify     │  Resend if notifyEmail && !notifiedAt
                    └─────────────┘
```

Each step is **idempotent** and **retryable**. WDK persists state between steps so a crash mid-run resumes at the last completed step.

**Step contracts:**

1. **`prepare(generationId)`** — read `generation` + `site`. If `site.sitemapUrl` is null, try `/sitemap.xml` → `/sitemap_index.xml` → `robots.txt` Sitemap directive. Persist `resolvedSitemapUrl`, set `status='running'`, `startedAt=now`. Returns `{ sitemapUrl }`. Retries on network errors; bad-input fails fast.

2. **`runGen(generationId, sitemapUrl)`** — `execa('node_modules/.bin/llmstxt', ['gen', sitemapUrl])` with `buffer: false`, streaming stdout into a Vercel Blob `put` at `gens/<id>/llms.txt`. On success, atomic update `llmsBlobPath`. Returns `{ blobPath }`. Retries 3× on transient errors.

3. **`runFull(generationId, sitemapUrl)`** — same shape, `gen-full` subcommand, blob path `gens/<id>/llms-full.txt`. The slow step. Streaming upload counts bytes; aborts and fails on `> MAX_OUTPUT_BYTES` (default 50MB).

4. **`complete(generationId)`** — set `status='succeeded'`, `completedAt=now`. Update `sites.lastGeneratedAt`. Idempotent.

5. **`notify(generationId)`** — if `notifyEmail` and not already `notifiedAt`, send Resend email linking to `/g/[id]`. Set `notifiedAt`. Failures here log but do not fail the workflow.

**Failure path** — any step exhausting retries lands in a workflow-level catch:
- Set `status='failed'`, `errorMessage = step.name + ': ' + truncate(error.message, 500)`.
- Skip `notify`.
- UI surfaces a red "Failed" badge with the message and a "Retry" button.

**Cancellation** — `POST /api/generations/[id]/cancel`:
- Calls WDK's cancel API on `workflowRunId`.
- Sets `status='cancelled'`.
- Daily cron sweeps `cancelled | failed` rows older than 1h and deletes any orphaned blob paths.

## 8. Error Handling

**Input validation (Zod, at route boundary):**

- Site creation: `name` 1–80 chars; `rootUrl` valid URL with `http(s)://`; `sitemapUrl` optional URL. Normalize `rootUrl` to origin (lowercase host, no path). Unique violation on `(userId, rootUrl)` → `409 { code: 'site_exists' }` with the existing site's id.
- Generation create: either `siteId` (must be owned) or a valid site-creation payload — never both.
- Webhook body: schema permits `{}` only; any `notify` field is silently ignored.

**Sitemap discovery & fetch:**

- 5xx / network → retry 3× with exponential backoff (1s, 4s, 16s). 4xx → fail fast.
- All discovery attempts miss → fail with `'No sitemap found. Add a sitemap URL on the site page.'`
- Size guard: if sitemap URL count > `MAX_SITEMAP_URLS` (default 5,000) → fail with `'Site too large for v1 (>5,000 URLs).'`

**`llmstxt` CLI process failures:**

- Spawn via `execa` from `node_modules/.bin/`; dependency-pinned in `package.json`. **Never** `npx -y` at runtime.
- Non-zero exit → capture last 4KB of stderr, store truncated 500 chars in `errorMessage`.
- Killed signal or empty stdout → retry once, then fail.
- Output size guard: streaming upload aborts above `MAX_OUTPUT_BYTES`.

**Blob upload:**

- `put` with `multipart: true`, `addRandomSuffix: false`, `access: 'public'` **off** — files stay private; proxy reads them server-side via the SDK.
- Transient `put` failure → retry 3×. Final failure → fail step with `'Storage upload failed.'`
- Orphaned blobs swept daily by cron.

**Auth / authz:**

- Cookie auth missing on `/(app)/*` → middleware redirects to `/signin?next=...`.
- Cookie auth missing on `/api/*` (non-webhook) → `401 { code: 'unauthenticated' }`.
- Owner mismatch on any resource → **404**, not 403 (don't leak existence).
- Webhook bad token → `401`. Unknown site → `404`. Both log enough to triage abuse without rate-limiting in v1.

**Concurrency:**

- Dedupe in a single transaction: `SELECT id FROM generations WHERE site_id = ? AND status IN ('pending','running')`. If found, return that row; else insert. SQLite single-writer makes this race-safe.
- State machine allows transitions `pending → running → succeeded|failed`, plus `* → cancelled` from explicit cancel. Cancel after terminal returns the current row unchanged (idempotent).
- Token rotation invalidates the old token immediately; webhooks with the stale token get `401`.

**Resend (email) failures:**

- Workflow `notify` step is best-effort. Retry transient 3×. On final failure, log + leave `notifiedAt` null so a manual "Resend email" can try again later.
- Generation status stays `succeeded` either way — email is not part of "did it work."

**SSE:**

- Server emits an event on every row update plus a heartbeat every 15s. Closes on terminal status or 10-min idle.
- Client reconnects with backoff if status isn't terminal.

**Surface in UI:**

- Detail page shows `errorMessage` verbatim in a `bg-destructive/10 text-destructive` block with a "Retry" button (`POST /api/generations` with same `siteId`).
- Dashboard shows a small `bg-destructive` dot next to sites whose latest generation failed.

## 9. Testing

CLAUDE.md is firm: every component gets a sibling `.test.tsx`, plus utility tests in Vitest. Layered plan:

**1. Lib / utility tests (`src/lib/**.test.ts`):**

- `sitemap-discover.test.ts` — happy paths for `/sitemap.xml`, `/sitemap_index.xml`, `robots.txt` Sitemap directive; all-fail; 5xx-then-success retry.
- `webhook-token.test.ts` — generation, hash, verify, prefix; constant-time compare.
- `auth-guards.test.ts` — `requireUser` redirects/throws; ownership helpers return 404-shaped errors on miss.
- `validators/*.test.ts` — Zod boundary cases (URL normalization, webhook body ignoring `notify`).

**2. DB tests (`src/db/**.test.ts`):**

- Migration applies cleanly to a fresh in-memory libsql DB.
- `unique(userId, rootUrl)` fires.
- Cascade: deleting a site removes its generations.
- Boolean column round-trips.

**3. API route tests (`src/app/api/**.test.ts`):**

Per route: ownership-mismatch (404, not 403) and validation-fail. Plus:

- `POST /api/generations` — manual happy path; dedupe returns existing row; "create site inline" path.
- `POST /api/webhooks/sites/[id]/regenerate` — bad token = 401, unknown site = 404, valid → 202 with `notifyEmail` forced true; second fire while in-flight → 202 + `X-Dedup: hit`.
- `GET /api/generations/[id]/files/[kind]` — owner downloads, non-owner 404, missing blob path 404, kind validation.
- `POST /api/generations/[id]/cancel` — running → cancelled, terminal → idempotent no-op.

**4. Workflow tests (`src/lib/workflow/**.test.ts`):**

- Each step idempotent: calling twice produces a single side effect.
- Step retries — fail twice transient, succeed third; assert no duplicate blobs.
- Final-failure path marks `failed` with `errorMessage`, skips `notify`.
- Parallel happy path: `runGen` + `runFull` both populate paths, `complete` fires once.
- `notify` skipped when `notifyEmail = false`; called with correct args when `true`; failure inside `notify` does not flip status off `succeeded`.
- Test harness: in-process synchronous step runner. Mocks: `execa`, `@vercel/blob`, `resend`.

**5. Component tests (per CLAUDE.md, sibling `.test.tsx`):**

- `SiteForm` — submit happy/invalid; URL normalization preview.
- `SitesList` — empty, populated, last-failed dot.
- `WebhookBlock` — masks by default; reveals fresh token only with `freshToken` prop; copy + rotate handlers fire.
- `StatusBadge` — every status renders the correct token class.
- `GenerationDetailCard` — each terminal state, error verbatim, retry enabled only on `failed | cancelled`, downloads disabled until path set.
- `GenerationsTable` — empty, populated, sorted desc by `createdAt`.
- `RegenerateButton` — popover open/closed, email checkbox, submit invokes mutation.
- Existing `OtpForm`, `SignOutButton` tests still pass after auth refactor.

**6. End-to-end happy path (one test, kept lean):**

`tests/e2e/generation-happy-path.test.ts` — mocks the CLI to emit tiny fixtures, runs API + workflow harness in-process, asserts both blob paths populate, status flips `succeeded`, and a Resend mock receives one email when `notifyEmail = true`.

**Test infrastructure additions:**

- `src/test/db.ts` — in-memory libsql + `drizzle-kit push` per test file.
- `src/test/mocks/blob.ts`, `src/test/mocks/execa.ts`, `src/test/mocks/resend.ts`, `src/test/mocks/workflow.ts`.

**Run gates:** `pnpm lint && pnpm test && pnpm build` passes before any PR.

## 10. Non-Goals (v1)

- No public-URL hosting of the generated files (download only).
- No quotas / rate limits on signed-in users beyond the one-active-job-per-site guard.
- No per-IP rate limiting on webhook endpoint.
- No multi-tenant team accounts.
- No editing the generated files in-app.
- No sites larger than 5,000 sitemap URLs.
- No outputs larger than 50MB per file.

## 11. Configuration

| Env var | Default | Use |
|---|---|---|
| `MAX_SITEMAP_URLS` | `5000` | Hard cap on sitemap URL count before failing fast |
| `MAX_OUTPUT_BYTES` | `52428800` (50MB) | Streaming upload byte cap |
| `BLOB_READ_WRITE_TOKEN` | (required) | Vercel Blob credential — already in `.env.example` |
| `RESEND_API_KEY` | optional in dev | Email send (logs to console in dev when blank) |
| `RESEND_FROM_EMAIL` | optional in dev | "From" address |
| `SESSION_SECRET` | (required) | JWT cookie signing — already in `.env.example` |
| `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | (required) | DB — already in `.env.example` |

WDK-specific env vars are out of scope for this spec — see §12.

## 12. Open Items for Implementation Plan

These are deliberately deferred to writing-plans:

- Exact WDK install + config (env vars, route handler shape).
- Whether `llmstxt` exposes a programmatic API or only a CLI binary — confirms `execa` shape.
- Exact `@vercel/blob` `put` signature for streaming upload (multipart options).
- The daily orphan-blob cron — Vercel cron config in `vercel.json` or `vercel.ts`.
