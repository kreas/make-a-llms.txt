# Citation Readiness Audit — Design

**Date:** 2026-05-19
**Status:** Approved (design phase)
**Surface:** `/sites/[id]` → new "Citations" tab + public API endpoints under `/api/v1/sites/[siteUid]/citation-audits/`
**Scope:** Per-page citation readiness scoring engine, on-demand from the dashboard or the public API. No batch, no scheduled runs, no workflow-step integration in v1.

## Problem

The home page advertises that AI Ready helps sites get cited by ChatGPT, Claude, Perplexity, Gemini, and Google AI Overviews. We need a real, page-level "is this page citation-ready?" score backed by concrete, actionable fixes — not a vague rubric. This spec defines the **audit engine** plus the **dashboard surface** that lets users see the score per page and trigger a fresh audit on demand.

Existing scope clarification: this project already has a feature called "AI Crawlers" that audits `robots.txt` posture. The new feature has a separate name (**Citation Readiness Audit**, code namespace `citation-audit`) to avoid collision.

## Goals

- For any page in a site's latest generation, produce a 0–100 citation readiness score with a per-check breakdown.
- 13 weighted checks total (see Rubric below) — every failing check returns a specific, page-grounded recommendation.
- User-triggered, per-page. Click → wait 5–15s → see result.
- Persist audit history per page so users (and future compare/trend UI) can see whether scores are improving over time.
- Expose the same engine via the public API (`/api/v1/...`) with bearer-token auth, full OpenAPI coverage, and a docs page.

## Non-Goals (v1)

- No automated batch audits and no "audit all pages" button. Per-page only.
- No integration with the existing generation workflow. The audit is decoupled from generation runs.
- No LLM-based soft checks (entity quality, summary quality). All 13 checks are pure-rule, deterministic.
- No PageSpeed Insights / Lighthouse "deep audit" mode. Deferred to a follow-up spec.
- No citation tracking against AI providers (does ChatGPT actually cite this page?) — separate service entirely.
- No auto-fix suggestions as PRs / CMS updates.
- No rate limiting on the audit endpoint. Sync wait + Cloudflare quota are natural limits in v1.
- No feature flag — the tab ships visible. Empty-state copy handles the "no audits yet" experience.

## Decisions Locked In

| Question | Decision |
|---|---|
| When does an audit run? | Strictly user-triggered. Per page. No generation-time integration. |
| What does the engine consume? | Raw rendered HTML, fetched via Cloudflare Browser Rendering `/content`. |
| Sync or background? | Sync — single `POST` returns the persisted audit row when complete (5–15s). |
| History or latest-only? | History. One row per audit run; latest per page surfaced in the tab list. |
| Number of checks in v1 | All 13, weighted to 100. |
| UI surface | New 4th tab `Citations` on `/sites/[id]`. List view + in-tab detail panel (no sub-route). |
| Source of the page list | Latest successful generation's `pagesManifestBlobPath`. |
| Public API | Yes. Mirrored under `/api/v1/sites/[siteUid]/citation-audits/`. Full OpenAPI + docs page. |
| Inputs to the engine | `{ url, entityName: site.name, html, fetchedAt }`. `expectedQueries` dropped. |
| Recommendations | Per-check templated strings, populated with evidence at score time. |
| Score reproducibility | Deterministic by construction. Same HTML → identical score. |

## Architecture

### High level

```
[User] → Dashboard Citations tab
            │
            └─ POST /api/sites/[siteUid]/citation-audits  { pageUrl }
                  │  (session auth, ownership check, pageUrl ∈ latest manifest)
                  │
                  ├─→ src/lib/citation-audit/fetch.ts
                  │       → POST cloudflare/browser-rendering/content
                  │       → returns rendered HTML (or fetch failure)
                  │
                  ├─→ src/lib/citation-audit/index.ts (auditPage)
                  │       → parse.ts (one-pass jsdom + Readability + htmlmetaparser)
                  │       → checks/* (13 pure functions over ParsedPage)
                  │       → score.ts (weighted aggregate + tier)
                  │
                  └─→ INSERT INTO citation_audits ...
                       RETURN persisted row
```

Public API surface (`/api/v1/sites/[siteUid]/citation-audits/...`) is the same library function (`runCitationAudit`) behind bearer-token auth.

### Engine module layout

```
src/lib/citation-audit/
  index.ts                  - exports auditPage and runCitationAudit
  fetch.ts                  - Cloudflare Browser Rendering /content client
  parse.ts                  - jsdom + Readability + htmlmetaparser one-pass
  score.ts                  - weighted aggregation, returns { score, tier }
  rubric.ts                 - the 13 checks + weights, single source of truth
  recommendations.ts        - per-check recommendation templates
  checks/
    h1-present.ts
    heading-hierarchy.ts
    meta-description.ts
    canonical.ts
    schema-type.ts
    schema-fields.ts
    answer-position.ts
    entity-first-paragraph.ts
    question-h2s.ts
    lists-tables.ts
    definitions.ts
    freshness.ts
    readability.ts
    named-entities.ts
    internal-links.ts
    index.ts                - re-exports + ordered list
```

### Engine contract

```ts
type AuditInput = {
  url: string;
  entityName: string;     // site.name
  html: string;
  fetchedAt: string;      // ISO timestamp
};

type CheckResult = {
  id: string;
  passed: boolean;
  score: number;          // 0-100 for this check
  weight: number;         // contribution to overall score
  evidence: string[];     // what was found
  recommendation: string | null;  // null when passed
};

type AuditResult = {
  score: number;          // 0-100 overall
  tier: 'poor' | 'fair' | 'good' | 'excellent';
  checks: CheckResult[];  // stable order, one per check
  metadata: { parseMs: number };
};

export function auditPage(input: AuditInput): Promise<AuditResult>;
```

Each check exports:

```ts
export const ID: string;
export const WEIGHT: number;
export function check(parsed: ParsedPage, ctx: CheckContext): CheckResult;
```

Pure, deterministic, zero-network. Parsing happens once in `parse.ts`; every check reads from the parsed object — no check re-parses HTML.

### `runCitationAudit` (the library function)

```ts
runCitationAudit({ siteId, pageUrl }): Promise<CitationAudit>;
```

This is what both the internal and the public POST routes call. It:

1. Loads the site row (for `site.name`).
2. Verifies `pageUrl` is present in the site's latest pages manifest (cheap guard against arbitrary URLs).
3. Calls `fetchRenderedHtml(pageUrl)`.
4. On fetch failure: inserts a `status='failed'` row, populates `errorReason` + `errorMessage`, returns the row.
5. On success: calls `auditPage(...)`, inserts a `status='succeeded'` row with the full `AuditResult` JSON, returns the row.

Route handlers only differ in auth + serialization.

## Cloudflare Browser Rendering Integration

**Endpoint:** `POST https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/browser-rendering/content`

**Auth:** Bearer token via new env var **`CLOUDFLARE_BROWSER_RENDERING_TOKEN`**, scoped to the `Browser Rendering - Edit` permission. `CLOUDFLARE_ACCOUNT_ID` is reused from the existing markdown pipeline.

**Request body (v1, minimal):**

```ts
{
  url: string,
  gotoOptions: { waitUntil: 'networkidle0', timeout: 20000 },
  rejectResourceTypes: ['image', 'media', 'font'],
  userAgent: 'CitationReadiness/1.0 (+https://make-a-llms.txt/bot)',
}
```

We block images/media/fonts because no check consumes them — saves rendering time and Cloudflare CPU. `waitUntil: 'networkidle0'` lets JS-rendered SPAs settle before snapshot.

**Response:** fully rendered HTML string. The `X-Browser-Ms-Used` header is captured into `metadata.browserMsUsed` for ops visibility.

**Module shape:**

```ts
type FetchOutcome =
  | { ok: true; html: string; fetchedAt: string; fetchMs: number; browserMsUsed: number }
  | { ok: false; reason: 'http' | 'timeout' | 'auth' | 'cloudflare' | 'unknown';
      status?: number; message: string };

export async function fetchRenderedHtml(url: string): Promise<FetchOutcome>;
```

**Timeouts:** Cloudflare call hard-capped at 25s. Route's `maxDuration = 30`. Total budget keeps comfortably inside Vercel's 300s ceiling.

**No retries inside the fetch.** A failed audit creates a real failure row the user can re-trigger; retries inside a 5–15s sync hang only make the worst case worse.

## Data Model

### New table: `citation_audits`

```ts
export const citationAudits = sqliteTable(
  'citation_audits',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    uid: text('uid').notNull().unique().$defaultFn(generateUid),
    siteId: integer('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    pageUrl: text('page_url').notNull(),
    status: text('status', { enum: ['succeeded', 'failed'] }).notNull(),
    score: integer('score'),                       // null on failure
    tier: text('tier', { enum: ['poor', 'fair', 'good', 'excellent'] }),  // null on failure
    results: text('results'),                      // JSON: full AuditResult; null on failure
    errorReason: text('error_reason'),             // FetchOutcome.reason; null on success
    errorMessage: text('error_message'),
    fetchMs: integer('fetch_ms'),
    browserMsUsed: integer('browser_ms_used'),
    fetchedAt: text('fetched_at').notNull().default(sql`(current_timestamp)`),
    trigger: text('trigger', { enum: ['manual'] }).notNull(),
    // generationId omitted in v1 — no workflow integration.
  },
  (t) => ({
    byPageRecent: index('cit_audit_by_page_recent').on(t.siteId, t.pageUrl, t.fetchedAt),
    bySiteRecent: index('cit_audit_by_site_recent').on(t.siteId, t.fetchedAt),
  }),
);
```

Indexes:
- `(siteId, pageUrl, fetchedAt DESC)` — cheap latest-audit-per-page lookup, and history list per page.
- `(siteId, fetchedAt DESC)` — powers the tab's "latest score per manifest URL" join.

## Rubric

13 checks, weights total 100. Tier mapping: `0-49 poor`, `50-69 fair`, `70-84 good`, `85-100 excellent`.

| Check | Weight | What it measures |
|---|---|---|
| `h1-present` | 5 | H1 present, matches title |
| `heading-hierarchy` | 5 | Single H1, no skipped levels |
| `meta-description` | 5 | Present, 120–160 chars |
| `canonical` | 3 | Canonical tag present |
| `schema-type` | 10 | Schema.org type appropriate for page type |
| `schema-fields` | 5 | Required schema fields present for the chosen type |
| `answer-position` | 15 | TL;DR / answer in first 100 words, contains entity name |
| `entity-first-paragraph` | 8 | Entity name appears in the first paragraph |
| `question-h2s` | 7 | At least 2 question-style H2s |
| `lists-tables` | 5 | Lists or tables present |
| `definitions` | 5 | "X is Y" pattern present in opening |
| `freshness` | 8 | `dateModified` (schema or chrono fallback) within 18 months |
| `readability` | 5 | Flesch–Kincaid grade level 8–10 |
| `named-entities` | 9 | Named entities extracted + disambiguated (linked or schema-marked) |
| `internal-links` | 5 | Internal links to related pages on the site |

**Total: 100.** Weights are version-pinned in `rubric.ts`. Changes to weights require an explicit migration moment (we won't silently shift scores).

## API

### Internal (session-authed, dashboard)

Under `src/app/api/sites/[siteUid]/citation-audits/`:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/latest` | Latest audit per page across the site. Returns one row per distinct `pageUrl`. |
| `GET` | `?pageUrl=<url>&limit=10&cursor=...` | History for a page, newest first, cursor-paginated. |
| `GET` | `/[auditUid]` | One audit by uid; full `results` JSON included. |
| `POST` | `` | Run a new audit. Body: `{ pageUrl }`. Sync. Returns the persisted row. |

### Public (bearer-token, OpenAPI-documented)

Mirrored under `/api/v1/sites/[siteUid]/citation-audits/`:

| Method | Path |
|---|---|
| `GET` | `/api/v1/sites/[siteUid]/citation-audits/latest` |
| `GET` | `/api/v1/sites/[siteUid]/citation-audits?pageUrl=...&limit=...&cursor=...` |
| `GET` | `/api/v1/sites/[siteUid]/citation-audits/[auditUid]` |
| `POST` | `/api/v1/sites/[siteUid]/citation-audits` |

Auth, scoping (cross-tenant → 404), and serialization match existing `/api/v1/generations/...`. Both route families call `runCitationAudit(...)` — handlers differ only in auth + response shaping.

### Response shape (success)

```jsonc
{
  "audit": {
    "id": "cit_01H...",                     // uid, returned as `id` per existing convention
    "siteId": "site_01H...",
    "pageUrl": "https://example.com/services/ai",
    "status": "succeeded",
    "score": 78,
    "tier": "good",
    "fetchedAt": "2026-05-19T14:23:11Z",
    "fetchMs": 412,
    "browserMsUsed": 3104,
    "trigger": "manual",
    "results": {
      "score": 78,
      "tier": "good",
      "metadata": { "parseMs": 142 },
      "checks": [
        {
          "id": "answer-position",
          "passed": false,
          "score": 40,
          "weight": 15,
          "evidence": ["First 100 words do not contain entity name."],
          "recommendation": "Add a 1-2 sentence summary in the first paragraph naming \"Example Co\" and its core value."
        },
        {
          "id": "h1-present",
          "passed": true,
          "score": 100,
          "weight": 5,
          "evidence": ["H1 found: 'AI Strategy Services'"],
          "recommendation": null
        }
      ]
    }
  }
}
```

### Response shape (failure)

```jsonc
{
  "audit": {
    "id": "cit_01H...",
    "siteId": "site_01H...",
    "pageUrl": "https://example.com/services/ai",
    "status": "failed",
    "score": null,
    "tier": null,
    "fetchedAt": "2026-05-19T14:23:11Z",
    "errorReason": "http",
    "errorMessage": "Target site returned 404",
    "trigger": "manual",
    "results": null
  }
}
```

### Validation

Request body validated with Zod in `src/lib/validators/citation-audits.ts`:

- `pageUrl` must be a syntactically valid URL.
- `pageUrl` must be present in the site's latest pages manifest — otherwise `422`.
- Body shape mismatch → `400`.

## UI

### Wire-in

`src/app/(app)/sites/[id]/site-detail-client.tsx`:

```tsx
<TabsTrigger value="citations">Citations</TabsTrigger>
...
<TabsContent value="citations"><CitationsTab siteId={site.uid} /></TabsContent>
```

### Tab list view (default)

A single table inside `<TabPanel>`. Columns: URL (middle-truncated), Score (numeric, mono), Tier pill, Last audited (relative time), chevron.

Sort: by score ascending by default (worst first, most actionable). Header click toggles.

Empty states:
- No successful generation yet → "Run a generation first to populate the page list" with a link to the generate flow.
- Generation exists but no audits yet → rows render with `—` for score and "Never" for last-audited.

Tier pill palette (reuses existing tokens):
- `excellent` → `semantic-success`
- `good` → `timeline-done`
- `fair` → `timeline-thinking`
- `poor` → `semantic-error`
- none → `timeline-read`

### Page detail view

In-tab drawer / detail panel — **not** a sub-route. Selecting a row reveals the detail in place and adds `?page=<encoded>` to the URL for shareable deep links.

Layout:

```
← Back to list                       [ Run new audit ]

<pageUrl>
Last audited <relative> • Audit #cit_01H...

[ score circle ]   <tier>
                   <N> of 13 checks failing

Checks
─────────────────────────────────────────────
✗ <check name>                weight <w> • <score>/100
   Found: <evidence joined>
   Fix: <recommendation>

✓ <check name>                weight <w> • <score>/100
   Found: <evidence joined>

... (failing checks first, then passing)

Previous audits
─────────────────────────────────────────────
• <relative>   <score>  <tier>     (current)
• <relative>   <score>  <tier>
• ...
```

- "Run new audit" is the primary CTA → `useMutation` against the POST endpoint. Disabled during mutation; copy reads "Auditing… (~10s)".
- On success: detail re-renders with the new audit; `['citation-audits', 'latest', siteUid]` and `['citation-audits', 'history', siteUid, pageUrl]` cache keys invalidated.
- On failure: button returns to default; inline error banner above the score: "Audit failed: <human-readable reason>" with a Retry button.
- Selecting a row in Previous audits replaces the current detail with that historical snapshot. A dimmed pill reads "Viewing audit from <relative>" until the user clears it. "Run new audit" always operates on the live URL, never on history.

### Component breakdown

```
src/components/citations/
  citations-tab.tsx              - tab root, fetches latest, renders list or detail based on ?page=
  citations-page-table.tsx       - the list view
  citations-page-detail.tsx      - the detail panel
  citations-score-badge.tsx      - the big score circle
  citations-check-row.tsx        - single check row (pass + fail variants)
  citations-tier-pill.tsx        - reusable pill
  citations-history-list.tsx     - previous audits list
```

Each ships with a colocated `.test.tsx`.

### TanStack Query keys

- `['citation-audits', 'latest', siteUid]` — tab list
- `['citation-audits', 'history', siteUid, pageUrl]` — page-detail history list
- `['citation-audits', 'one', siteUid, auditUid]` — single audit detail
- `useMutation` for POST → invalidates `latest` and `history` on success.

## Documentation Deliverables

This is part of v1 scope, not a follow-up:

1. **Zod schemas** added to `src/lib/openapi/schemas.ts`:
   - `CitationAuditSchema`
   - `CitationCheckResultSchema`
   - `RunCitationAuditRequestSchema`
   - Error response shapes (reuse existing patterns where possible).
2. **OpenAPI operations** added to `src/lib/openapi/document.ts` for the four public endpoints, with request/response examples derived from real fixture audits so the docs "Try it" flow works.
3. **New docs page** `content/docs/citation-audits.mdx`:
   - Overview: what citation readiness means + tier definitions.
   - **How scoring works** (its own section, public-facing, before the check list):
     - The score is a weighted sum across 13 independent checks. Each check returns its own 0–100 sub-score and contributes to the final score in proportion to its weight. Final formula made explicit:
       `score = round( sum(check.score × check.weight) / sum(check.weight) )` where `sum(check.weight) = 100`.
     - The full **rubric table** is duplicated from this design doc into the MDX page, with `Check ID`, `Weight`, and a one-line "What this measures" column. Users can see at a glance which checks matter most.
     - Tier thresholds spelled out: `0–49 poor`, `50–69 fair`, `70–84 good`, `85–100 excellent`.
     - A worked scoring example: walk through a small subset (3–4 checks) on a real sample page showing how the per-check scores roll up to a final value. Concrete numbers, no hand-waving.
     - Failure-mode behavior: if the audit fetch fails (404 / Cloudflare error / timeout) the audit row is `status='failed'` and has no score — it does not contribute a 0. This is documented explicitly so users don't misread "no score" as "0/100".
     - Determinism note: same HTML in → identical score out. Re-auditing without changing the page produces the same number.
     - Versioning note: rubric weights are pinned in code. We won't silently shift scores; any weight change is an explicit, announced rubric revision. (A `rubricVersion` column on the audit row is a candidate follow-up once we ever ship a v2 rubric — out of scope for v1, where there's exactly one version.)
   - **The 13 checks**: dedicated subsection per check with `Check ID`, `Weight`, "What this measures", "When it passes", "How to fix it when it fails", and an example evidence + recommendation snippet pulled from a fixture audit. This is the actionable reference users will return to.
   - Endpoint reference: links into the auto-generated API reference for each route.
   - Worked example: `curl` to POST a new audit, sample success response, common failure cases (target 404, JS-only blocked render, Cloudflare quota).
4. **Update** `content/docs/meta.json` to register the new page in the sidebar.
5. **Quickstart pointer** in `content/docs/quickstart.mdx` so first-time API users discover the audit endpoint.

OpenAPI is inlined into the bundle (per PR #5), so adding operations doesn't change deploy mechanics.

## Tech Stack Additions

```jsonc
{
  // Parsing + rules
  "jsdom": "^25.x",
  "@mozilla/readability": "^0.x",
  "htmlmetaparser": "^2.x",
  "htmlparser2": "^9.x",
  "compromise": "^14.x",
  "text-readability": "^1.x",
  "chrono-node": "^2.x",
  "tldts": "^6.x"
}
```

All majors pinned. The `parse.ts` library choice (jsdom vs. cheerio) is provisionally jsdom because Readability + microdata extraction needs a full DOM; confirm with a quick spike in the plan phase.

## Testing

### Engine

- Each of the 13 check modules ships with a colocated `.test.ts` containing at least one passing fixture and one failing fixture (inline template-literal HTML; no external fixture loader).
- `parse.ts` test: known HTML → asserted `ParsedPage` shape. Guards against parser-library upgrades silently breaking downstream checks.
- `score.ts` test: synthetic `CheckResult[]` → asserted weighted sum and tier mapping. Pure math.
- `auditPage` integration test (no network): hand-crafted high-score and low-score HTML through the full engine; assert tier and the set of failing check ids.

### Fetch layer

- `fetch.ts` against a mocked Cloudflare endpoint. Cases: success (html + browserMsUsed), 401 → `auth`, 5xx → `cloudflare`, timeout → `timeout`, target 4xx → `http` with status.
- No live Cloudflare call in CI.

### API routes

- `POST /api/sites/.../citation-audits`: unauth → 401, cross-tenant → 404, pageUrl not in manifest → 422, fetch failure → 200 with `status='failed'`, success → 200 with `status='succeeded'`.
- `GET` routes: latest-per-page joins correctness; history pagination; single-by-uid.
- `/api/v1/` routes: same suite swapped to bearer-token auth.

### UI

- One `.test.tsx` per component. Test behavior, not internals: clicking a row opens the detail; "Run new audit" disables during mutation and re-renders on success; failure banner appears on error; tier pill renders the right palette.

No e2e in v1. Vitest unit coverage on each layer + type-safe integration is sufficient for a feature with no fan-out and no async orchestration.

## Rollout

- Single migration: `drizzle/<next>_citation_audits.sql` creating the table + two indexes.
- Single env var addition: `CLOUDFLARE_BROWSER_RENDERING_TOKEN`. Document in `.env.example`. Verify `CLOUDFLARE_ACCOUNT_ID` is present (it should be, from the markdown pipeline); reuse.
- No feature flag. Tab ships visible; empty-state copy handles the "no audits yet" experience.
- POST route declares `export const maxDuration = 30`.
- No cron, no queue, no workflow steps — nothing new to monitor beyond the new route's Vercel logs.

## Acceptance Criteria

- A user with a successful generation can open the Citations tab, see a list of pages with `—` scores, click a page, click "Run new audit", and within ~15s see a populated score, tier, and check breakdown.
- Audit results are persisted and the same page can be re-audited; both runs appear in the Previous audits list, newest first.
- Failed audits (target 404, Cloudflare error, timeout) produce a `status='failed'` row with a human-readable error and a working Retry button. The tab list shows `—` for such pages.
- Every failing check returns a non-null `recommendation` field. Recommendations are specific (reference the entity name, the page url, or evidence found), not generic.
- The same audit run on the same HTML produces the same score and the same per-check results.
- The `/api/v1/sites/[siteUid]/citation-audits/*` endpoints work end-to-end with a bearer token and are documented in OpenAPI + the new docs page.
- All check modules, the fetch module, the API routes, and the new components have passing tests.
- `pnpm test` and `pnpm build` pass.

## Out of Scope (v1) — Follow-Up Specs

- **Site-wide / batch audits.** A separate spec for "audit every page on this site" using Vercel Workflow DevKit fan-out (same pattern as the existing generation workflow), once we know what users actually want at scale.
- **Workflow integration.** Running an audit automatically after every generation, like the crawler audit step. Cheap to add later; current decision is no.
- **Deep audit / PageSpeed Insights.** Lighthouse-grade SEO + performance signals merged with our score.
- **LLM-based soft checks.** Entity quality, summary quality, "would this page actually answer the query?" — needs eval infra first.
- **Citation tracking.** Does ChatGPT / Perplexity / Claude / Gemini actually cite this page? Separate service.
- **Rate limiting and per-token quotas.** Add when abuse signal appears.
- **Compare / trend UI.** Now possible because we keep history; UI is a follow-up.

## Open Questions for the Plan Phase

- Confirm `CLOUDFLARE_ACCOUNT_ID` is already in env (it should be — verify in `src/lib/markdown-pages/cloudflare.ts`).
- Confirm `jsdom` vs `cheerio` for `parse.ts` with a quick spike. Default is jsdom.
- Recommendation copy strings — drafted per check during implementation, reviewed in the PR.
- Cursor format for history pagination — match whatever existing v1 routes use (likely opaque base64 of `(fetchedAt, id)`).
- **Lock the exact heuristic for every check.** The rubric here states intent; implementation must define the precise rule. In particular:
  - `schema-type`: which Schema.org types count as "appropriate" (probable set: `Article`, `BlogPosting`, `FAQPage`, `Product`, `Service`, `Organization`, `AboutPage`, `WebPage` falls below ceiling).
  - `schema-fields`: required-field map per type.
  - `question-h2s`: regex / leading-word list for "question-style".
  - `internal-links`: define as same-host outbound links to non-self URLs; minimum count for pass.
  - `named-entities`: define "disambiguated" — has schema.org markup OR `<link>`/`<a>` to an authoritative page (Wikipedia, Wikidata, official site).
  - `definitions`: pattern + scope ("X is Y" / "X means Y" within first paragraph).
  - `readability`: target grade range and behavior outside it (linear falloff vs binary).
  - Tie all of the above to fixture HTML in the test suite.
