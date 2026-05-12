# Per-Page Markdown — Design Spec

**Date:** 2026-05-12
**Status:** Approved for planning
**Parent feature:** `make-a-llms.txt` (see `2026-05-07-make-a-llms-txt-design.md`)

## 1. Summary

Extend the existing generation pipeline so every run also produces a per-page Markdown rendering of every URL in the resolved sitemap, fetched via Cloudflare's Browser Rendering API (`/browser-rendering/markdown`). Output is stored as one private blob per page plus a `pages-manifest.json`. The generation detail page (`/g/[id]`) gains a "Pages" section with a URL-path tree on the left, a Markdown preview pane on the right, and a "Download all (.zip)" button that streams a zip built on-demand. The branch is isolated: failures in this branch do not fail the overall run.

The framing is "premium feature, available to all users for now" — no entitlement gate in v1.

## 2. Decisions Locked During Brainstorming

| Decision | Choice |
|---|---|
| Trigger model | Extra parallel branch inside the existing `generateSiteFilesWorkflow` run |
| Branch coupling | **Isolated** — markdown failures do not fail the overall run |
| Hard ceiling | 250 URLs per generation; sitemaps with more → markdown branch is **skipped** (run still succeeds for `llms.txt`/`llms-full.txt`) |
| Failure policy | Best-effort per URL; manifest carries per-URL `status` + `reason` |
| Storage | One private blob per `.md` + one `pages-manifest.json`; zip built on-demand |
| Tree layout | URL-path hierarchy + side-by-side preview pane |
| Tree location | Inline section on `/g/[id]`, below the existing downloads card |
| Per-URL state | DB stays light: four new columns on `generations`. All per-URL state lives in `pages-manifest.json`. |
| Output structure | Tiny YAML frontmatter (`source`, `generated_at`) + CF's Markdown body |
| Entitlement gate | None in v1 |
| Renderer | `react-markdown` + `remark-gfm` (preview pane) |
| Zip library | `archiver` (streaming, server-only) |

## 3. Architecture

The existing workflow runs `prepare → [runGen ║ runFull] → complete → notify`. The markdown work joins as a third parallel branch — **isolated** from the existing two, so a markdown-side failure cannot deny the user their `llms.txt`.

```
prepare
  ├─ runGenStep           (required — failure → run fails)
  ├─ runFullStep          (required — failure → run fails)
  └─ runPagesStepSafe     (isolated — failure → pages_status='failed', run still succeeds)
       │
       ├─ load + filter sitemap URLs (250 cap, origin-filter, dedup)
       ├─ pool(concurrency=5):
       │     - call CF /browser-rendering/markdown (2 retries on transient errors)
       │     - write gens/<genId>/pages/<path>.md to private blob
       │     - append manifest entry
       └─ write gens/<genId>/pages-manifest.json
complete → notify
```

`runPagesStepSafe` is a single `'use step'` function. It wraps everything in try/catch and writes terminal state to the DB itself; it never throws back into the workflow body. The outer `try/catch/Promise.all` in `generateSiteFilesWorkflow` therefore continues to handle only `llms.txt`-relevant failures.

### 3.1 CF API call shape

```http
POST https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/browser-rendering/markdown
Authorization: Bearer {CLOUDFLARE_API_TOKEN}
Content-Type: application/json

{ "url": "<page url>" }
```

On 200, CF returns `{ success: true, result: "<markdown>" }`. The body is wrapped with frontmatter before writing to blob:

```md
---
source: https://example.com/docs/cdn
generated_at: 2026-05-12T14:23:00Z
---

<CF markdown body>
```

The frontmatter is intentionally minimal. It exists to give downstream consumers (today: the WordPress plugin planned in a future iteration; in general: any agent reading the file) a stable provenance signal without coupling output shape to the broader product.

## 4. Data Model

Four additions to the existing `generations` table. No new tables.

```ts
// src/db/schema.ts — additions to the generations table
pagesManifestBlobPath: text('pages_manifest_blob_path'),
pagesCount:            integer('pages_count').notNull().default(0),
pagesStatus:           text('pages_status', {
                         enum: ['pending', 'running', 'succeeded', 'failed', 'skipped', 'cancelled'],
                       }).notNull().default('pending'),
pagesErrorMessage:     text('pages_error_message'),
```

`pagesStatus` is independent of the run-level `status`. The UI surfaces both.

### 4.1 Manifest shape

```json
{
  "version": 1,
  "generationId": 42,
  "siteRootUrl": "https://example.com",
  "sitemapUrl": "https://example.com/sitemap.xml",
  "generatedAt": "2026-05-12T14:23:00Z",
  "totalUrls": 87,
  "successCount": 84,
  "failedCount": 3,
  "skippedCount": 0,
  "pages": [
    {
      "url": "https://example.com/docs/cdn",
      "path": "docs/cdn",
      "filename": "cdn.md",
      "blobPath": "gens/42/pages/docs/cdn.md",
      "status": "ok",
      "bytes": 4823,
      "durationMs": 1250
    },
    {
      "url": "https://example.com/docs/edge",
      "path": "docs/edge",
      "filename": "edge.md",
      "blobPath": null,
      "status": "failed",
      "reason": "Cloudflare returned 502 after 3 attempts",
      "durationMs": 4200
    }
  ]
}
```

Per-URL `status` enum: `'ok' | 'failed' | 'skipped'`. `skipped` is used pre-CF (cross-origin filter, dedup loser, asset-like extension if we choose to extend later).

### 4.2 URL → file path mapping

- **Origin filter**: only URLs whose origin matches the site's `rootUrl` are retained; others go into the manifest with `status: 'skipped'`, `reason: 'cross-origin'`.
- Strip query string + fragment before pathing.
- Trailing slash normalised away.
- `/` → `index.md`.
- `path/to/page` → `path/to/page.md`. `.html`/`.htm` suffixes replaced with `.md`.
- Path segments are URL-decoded then re-encoded against an allowlist (letters, digits, `-`, `_`, `.`). Anything else becomes `-`.
- Collisions resolved deterministically by appending `-1`, `-2`, etc. The full original URL stays in the manifest entry, and the collision is noted.
- Duplicate URLs in the sitemap are deduped before processing; dedup count appears in the manifest summary.

## 5. Workflow Internals

```ts
// pseudocode for src/lib/workflow/steps.ts
export async function runPagesStepSafe(
  generationId: number,
  sitemapUrl: string,
  rootUrl: string,
): Promise<void> {
  'use step';
  try {
    await markPagesRunning(generationId);

    const urls = await loadAndFilterSitemap({ sitemapUrl, rootUrl });
    if (urls.length === 0) {
      return markPagesSkipped(generationId, 'no eligible URLs');
    }
    if (urls.length > PAGES_PER_RUN_CAP) {
      return markPagesSkipped(generationId, `sitemap has ${urls.length} URLs (cap ${PAGES_PER_RUN_CAP})`);
    }
    if (!process.env.CLOUDFLARE_ACCOUNT_ID || !process.env.CLOUDFLARE_API_TOKEN) {
      return markPagesFailed(generationId, 'Cloudflare credentials missing');
    }

    const manifest = await processWithPool(urls, {
      concurrency: Number(process.env.CLOUDFLARE_BR_CONCURRENCY ?? 5),
      generationId,
      isCancelled: () => readCancelFlag(generationId),
    });

    await writeManifestBlob(generationId, manifest);

    if (manifest.cancelled) {
      return markPagesCancelled(generationId, manifest);
    }
    return markPagesSucceeded(generationId, manifest);
  } catch (err) {
    return markPagesFailed(generationId, truncate(errorMessage(err), 500));
  }
}
```

### 5.1 Worker pool

A small async pool (≈30 lines, no extra dep). Five concurrent in-flight CF calls. Each completion releases a slot.

### 5.2 Per-URL retry

Retry happens **inside the step**, not at the WDK layer. WDK's `RetryableError` / `FatalError` are reserved for whole-step retry semantics that we explicitly do not want here (one flaky URL must not re-trigger the entire markdown branch). The CF client throws plain typed errors with a local discriminator:

```ts
type CfErrorKind = 'transient' | 'fatal';
class CfClientError extends Error {
  constructor(message: string, public readonly kind: CfErrorKind) { super(message); }
}
```

Each CF call gets up to 3 attempts total (2 retries) with backoff `1s, 3s`. Discrimination:

| CF response | Kind | Behaviour |
|---|---|---|
| `200` with `success: true` | — | OK; record markdown, bytes, durationMs. |
| `429` | `transient` | Retry; respect `Retry-After` if present (capped at 10s). |
| `5xx` | `transient` | Retry. |
| `400`/`401`/`403`/`404` | `fatal` | Record as `failed` immediately; no retry. |
| timeout (30s) | `transient` | Retry. |
| network error | `transient` | Retry. |

After exhausting retries → manifest entry `status: 'failed'`, `reason` carries the last error. The step itself never throws on a per-URL failure.

### 5.3 Cancellation

The pool re-reads `generations.status` every 5 completions. If it sees `'cancelled'`, it stops accepting new work, waits for in-flight requests to settle, writes a partial manifest, and resolves with `cancelled: true`. `runPagesStepSafe` then sets `pagesStatus='cancelled'`.

This is intentionally coarse (poll, not signal). It avoids cross-step coordination complexity for marginal latency cost — at worst, a user-cancelled run keeps doing 5 more CF calls before stopping.

### 5.4 Step retry semantics

If the step itself crashes (process death, runtime error before its outer try wraps), WDK retries the whole step from scratch. CF calls redo. Manifest is overwritten. Orphaned per-page blobs from the previous attempt are swept by the existing orphan-cleanup cron (extended in §8).

### 5.5 Workflow body change

```ts
// src/lib/workflow/generate-site-files.ts
const { sitemapUrl, rootUrl } = await prepareStep(generationId);

await Promise.all([
  runGenStep(generationId, sitemapUrl),
  runFullStep(generationId, sitemapUrl),
  runPagesStepSafe(generationId, sitemapUrl, rootUrl),   // never throws
]);

await completeStep(generationId);
await notifyStep(generationId);
```

`prepareStep` is extended to also return `rootUrl` (it already loads the site row to discover the sitemap).

## 6. API Surface

Three new authed routes, all using the existing `requireUser()` + ownership pattern. Same security shape as the existing file proxy — blob paths are never exposed to the client.

### 6.1 `GET /api/generations/[id]/pages`

Returns the parsed `pages-manifest.json`. When the manifest is not yet written, responds with the latest known summary instead:

```json
{ "status": "pending",   "pages": [] }
{ "status": "running",   "pages": [] }
{ "status": "succeeded", ...full manifest... }
{ "status": "cancelled", ...partial manifest... }
{ "status": "skipped",   "reason": "sitemap has 412 URLs (cap 250)", "pages": [] }
{ "status": "failed",    "reason": "Cloudflare credentials missing", "pages": [] }
```

Caller: `/g/[id]` page on mount; refetches via the existing SSE-driven cache invalidation.

### 6.2 `GET /api/generations/[id]/pages/[...path]`

Streams one page's markdown text. Authed; the requested `[...path]` is validated against the manifest before the blob is fetched (manifest-driven allowlist — paths outside the manifest 404 even if the blob exists).

Headers: `Content-Type: text/markdown; charset=utf-8`, `Content-Disposition: inline`.

### 6.3 `GET /api/generations/[id]/pages.zip`

Streams a zip on-demand using `archiver`. The archive contains:

- `manifest.json` at the root.
- Every page where `status === 'ok'`, at its manifest path (e.g., `docs/cdn.md`).

Skipped/failed entries are not included in the archive but are documented in the bundled `manifest.json`.

Headers: `Content-Type: application/zip`, `Content-Disposition: attachment; filename="<site-name>-pages-<genId>.zip"`. Site name is slugified.

### 6.4 Cron extension

`/api/cron/cleanup-orphans` already deletes generation blobs whose parent row is gone. Extension: when listing under a generation prefix, recurse into `pages/` and include `pages-manifest.json`. Single-prefix sweep — no new code paths, just a small change to whatever listing call the cron already issues.

## 7. UI

A new `PagesSection` mounts on `/g/[id]` directly below the existing llms.txt downloads card.

### 7.1 State matrix

| `pagesStatus` | What renders |
|---|---|
| `pending` / `running` | Skeleton: "Rendering page Markdown…" with the existing SSE pulse style. |
| `succeeded` | Summary line ("84 of 87 pages rendered — 3 failed") + tree + preview pane + "Download all (.zip)" button. |
| `cancelled` | Same layout as `succeeded` but the summary reads "Cancelled — N pages rendered before stop." |
| `failed` | Compact error card with `pagesErrorMessage`. No tree. Tone is informational, not alarming — the run itself is fine. |
| `skipped` | Brief note explaining the skip reason. No tree. |

### 7.2 Components

- `PagesSection` — top-level wrapper; owns the manifest query (TanStack Query) and `selectedPath` state. Renders the state matrix above.
- `PagesTree` — pure component over the manifest. Builds the folder hierarchy in memory and renders it recursively with status dots. Click → `onSelect(path)`. Failed/skipped nodes are visually muted but clickable, showing the per-URL reason in the preview pane instead of markdown.
- `PagesPreview` — fetches `/api/generations/[id]/pages/[...path]` when `selectedPath` changes (`react-query` cache by path). Renders via `react-markdown` + `remark-gfm`. Empty state: "Select a page on the left to preview."

### 7.3 Tree behaviour

- Root folder open by default.
- Descendants beyond depth 2 collapsed initially to keep 250-entry trees readable.
- Folder nodes show a count badge of pages inside that folder: `(ok-in-folder/total-in-folder)`. Counts are recursive (include nested subfolders).
- Failed/skipped nodes show their status dot color (mapped to `bg-timeline-edit` / muted gray).

### 7.4 Styling

Per `DESIGN.md`:
- `bg-surface-card`, hairline borders, no shadows.
- Section heading uses `caption-uppercase`.
- Status dots reuse the timeline pastels (`-grep` for running, `-done` for ok, `-edit` for failed). These tokens are explicitly scoped to in-product agent UI per the design system, which this fits.
- Preview pane uses the existing body typography (`text-body`) for prose; code blocks render with `font-mono` (JetBrains Mono).

## 8. Operational

### 8.1 Environment variables

Two required, two optional. All four added to `.env.example`:

```
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_API_TOKEN=
CLOUDFLARE_BR_CONCURRENCY=5        # optional
PAGES_PER_RUN_CAP=250                # optional
```

Note: the example token shared during brainstorming is treated as throwaway and rotated; no literal values are committed.

### 8.2 Cron cleanup

Already covered in §6.4 — orphan cleanup sweeps `gens/<id>/pages/` and `gens/<id>/pages-manifest.json` alongside the existing per-generation blobs.

### 8.3 Email

`notifyStep` body is unchanged in shape. One conditional line is added: when `pagesStatus === 'succeeded'`, append "We also rendered Markdown for N of M pages — view them on the generation page." Other `pagesStatus` values are not surfaced in the email; `/g/[id]` carries the detail.

### 8.4 Existing safeguards reused

- One-active-job-per-site guard already prevents concurrent runs.
- Webhook regen path is unchanged — same workflow, same branches.
- Cancel flow is unchanged from the API surface; the new step honors it via §5.3.

## 9. Files Added / Touched

```
src/db/schema.ts                                          # extend generations
drizzle/<new_migration>.sql                               # generated
src/lib/workflow/steps.ts                                 # add runPagesStepSafe; extend prepareStep return
src/lib/workflow/generate-site-files.ts                   # add third parallel branch
src/lib/markdown-pages/cloudflare.ts                      # CF API client + retry helper
src/lib/markdown-pages/sitemap-urls.ts                    # sitemap parse → URL list + cap check
src/lib/markdown-pages/url-to-path.ts                     # mapping + collision handling
src/lib/markdown-pages/manifest.ts                        # shape + read/write helpers
src/lib/markdown-pages/pool.ts                            # bounded concurrency helper
src/app/api/generations/[id]/pages/route.ts               # GET manifest
src/app/api/generations/[id]/pages/[...path]/route.ts     # GET one .md
src/app/api/generations/[id]/pages.zip/route.ts           # streamed zip
src/app/api/cron/cleanup-orphans/route.ts                 # extend prefix sweep
src/components/generations/pages-section.tsx              # wrapper + state matrix
src/components/generations/pages-tree.tsx                 # tree view
src/components/generations/pages-preview.tsx              # markdown render pane
src/app/(app)/g/[id]/generation-client.tsx                # mount PagesSection
.env.example                                              # CF + tuning vars
```

New dependencies:
- `archiver` (streaming zip; server-only)
- `react-markdown` + `remark-gfm` (preview rendering)

## 10. Testing

### 10.1 Unit tests

| File | Covers |
|---|---|
| `src/lib/markdown-pages/url-to-path.test.ts` | Cross-origin filter, `/ → index.md`, `.html` rewriting, query/fragment strip, dedup, collision suffixing, unicode/space/`..` sanitisation. |
| `src/lib/markdown-pages/cloudflare.test.ts` | Happy path; 429 → transient kind; 5xx → transient kind; 401/403 → fatal kind; timeout → transient kind. Verifies the 3-attempt retry loop honors backoff and `Retry-After`. |
| `src/lib/markdown-pages/sitemap-urls.test.ts` | Standard sitemap, sitemap-index (one level), cap enforcement, ordering. |
| `src/lib/markdown-pages/manifest.test.ts` | Build manifest, summary counts, round-trip serialise/parse. |
| `src/lib/markdown-pages/pool.test.ts` | Concurrency obeyed, cancellation between batches, error in one task doesn't fail siblings. |
| `src/lib/workflow/steps.test.ts` (extend) | `runPagesStepSafe`: skipped on cap, failed on missing creds, succeeded on happy path, cancelled honors the DB flag. |

### 10.2 Component tests

| File | Covers |
|---|---|
| `src/components/generations/pages-tree.test.tsx` | Folder hierarchy from a fixture manifest, status dots, `onSelect` fires correct path, failed/skipped nodes clickable. |
| `src/components/generations/pages-preview.test.tsx` | Renders markdown, refetches on `selectedPath` change, empty state, error state. |
| `src/components/generations/pages-section.test.tsx` | Each `pagesStatus` state renders correctly; download button wired. |

### 10.3 API tests

| File | Covers |
|---|---|
| `src/app/api/generations/[id]/pages/route.test.ts` | Owner sees manifest; non-owner 404; pending shape when no manifest. |
| `src/app/api/generations/[id]/pages/[...path]/route.test.ts` | Owner gets markdown with correct content-type; non-owner 404; paths not in manifest 404 even if the blob exists. |
| `src/app/api/generations/[id]/pages.zip/route.test.ts` | Streams a zip containing manifest + included pages; attachment filename slugified; non-owner blocked. |
| `src/app/api/cron/cleanup-orphans/route.test.ts` (extend) | Cleans up `pages/` prefix and `pages-manifest.json` alongside existing blobs. |

### 10.4 E2E

Extend `src/test/e2e/generation-happy-path.test.ts`:

- Seed a 3-URL fake sitemap.
- Mock CF at the `fetch` boundary (same module-mock pattern as blob/resend/execa).
- Mock blob writes via existing `src/test/mocks/blob.ts`.
- Drive the workflow end-to-end; assert `status='succeeded'`, `pagesStatus='succeeded'`, manifest written, 3 blob writes, 3 `ok` entries in manifest.
- Additional case: one CF call returns 502 after retries → `status='succeeded'`, `pagesStatus='succeeded'`, 2 `ok` + 1 `failed` in manifest.

### 10.5 Manual smoke

A `pnpm dev` walk-through against a small real site to verify the tree, the preview rendering, and the zip download in a real browser.

## 11. Out of Scope for v1

Captured here so reviewers know they were considered:

- Entitlement / premium gating (deferred to whenever billing lands).
- Per-URL re-run from the UI (would require either per-row state or a manifest-mutating endpoint).
- Asset-extension skip list (`.pdf`, `.png`, etc.). Easy follow-up if real sitemaps make this noisy.
- Site-level configurable cap (single env-var cap covers v1).
- Recursive sitemap-index beyond one level (most cases handled; deep nesting is rare).
- WordPress plugin that serves `.md` when `Accept: text/markdown; charset=utf-8` matches — separate project; only relevance here is the frontmatter shape we commit to.
- Cross-origin sitemap entries (blog.example.com from example.com). Skipped today; revisit if real users hit this.

## 12. Open Questions

None at spec sign-off.
