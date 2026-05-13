# AI Crawler Audit — Design

**Date:** 2026-05-13
**Status:** Approved (design phase)
**Surface:** `/sites/[id]` → new "AI Crawlers" tab
**Scope:** Audit + robots.txt generator, both in v1.

## Problem

Most site owners have no idea which AI crawlers their site is allowing or
blocking. The new home page advertises a "Crawler Audit" card; this spec
defines the real feature behind it. For every saved site, AI Ready will parse
the site's `robots.txt` and surface a per-bot allow/block posture for nine
known AI user-agents, plus a one-click generator that emits the directives the
user actually wants.

## Goals

- Show, for each saved site, the current allow/block posture across
  `GPTBot`, `ClaudeBot`, `Claude-Web`, `PerplexityBot`, `Google-Extended`,
  `CCBot`, `Bytespider`, `Applebot-Extended`, `Amazonbot`.
- Keep the data current automatically (audit runs after every generation
  success) and let users force a fresh check on demand.
- Let users assemble a corrected `robots.txt` snippet by toggling allow/block
  per bot and copying the result.

## Non-Goals (v1)

- No public/unauthenticated audit tool.
- No audit history UI — the tab shows the latest row only. (We retain history
  in the database for future use.)
- No per-bot path customization in the generator. Each bot is a binary
  allow/block decision in v1.
- No automated push to the user's robots.txt. The generator emits a snippet to
  copy.
- No rate limiting on the re-audit endpoint.

## Decisions Locked In

| Question | Decision |
|---|---|
| Where does the audit live? | In-app, per saved site. |
| When does it run? | Auto after every generation success **and** on-demand re-audit. |
| Generator scope | Ship in v1, per-bot binary toggle. |
| UI placement | New "AI Crawlers" tab on `/sites/[id]`. |
| Audit step in workflow | Runs **after** generation success. Non-blocking — failure logs but doesn't fail the workflow. |
| Status pill palette | `allowed` = semantic-success; `blocked` = semantic-error; `partial` = timeline-thinking; `default` = timeline-read. |
| Snippet format | Merged groups (multiple `User-agent:` lines sharing an `Allow: /` or `Disallow: /` rule). |
| Default-state bots in the snippet | Omitted (no opinion = no rule emitted). |

## Data Model

### New table: `crawler_audits`

```ts
{
  id: integer primary key autoincrement,
  siteId: integer not null references sites(id) on delete cascade,
  status: 'succeeded' | 'failed' not null,
  robotsUrl: text not null,                  // e.g. https://example.com/robots.txt
  robotsContent: text,                       // raw body, nullable when fetch failed
  results: text not null,                    // JSON, shape below
  errorMessage: text,                        // populated when status='failed'
  fetchedAt: text not null default current_timestamp,
  trigger: 'generation' | 'manual' not null,
  generationId: integer references generations(id) on delete set null,
}
```

Indexes: `(siteId, fetchedAt DESC)` for the latest-audit lookup.

### `results` JSON shape

```ts
type AuditResult = {
  [botName: string]: {
    status: 'allowed' | 'blocked' | 'partial' | 'default';
    disallowedPaths?: string[]; // populated when status='partial'
  };
};
```

The set of keys is exactly the nine known bot names, hardcoded in a shared
constant `KNOWN_AI_BOTS`.

### Status semantics

- `allowed` — an explicit user-agent group exists for this bot, and the root
  path `/` is not blocked.
- `blocked` — an explicit user-agent group exists for this bot with
  `Disallow: /`.
- `partial` — an explicit user-agent group exists for this bot with at least
  one `Disallow` rule, but `/` is still reachable.
- `default` — the bot is not mentioned in any explicit user-agent group. It
  falls under the `*` group (or, if no robots.txt exists, has no restrictions
  at all). Semantically: the user hasn't made a decision about this bot.

## Robots.txt Fetch & Parse

### Fetch

- URL: `<site.rootUrl>/robots.txt`.
- Timeout: 10 seconds.
- Max body size: 512 KB. Bodies larger than this fail the audit.
- `User-Agent: AI-Ready-Auditor/1.0`. (A contact URL can be appended later
  once the production domain is settled; not a blocker for v1.)
- Up to 3 same-origin redirects followed. Cross-origin redirects are treated
  as "not found" (all bots become `default`).
- HTTP 200 with body → parse.
- HTTP 404 → succeeded audit, every bot = `default`.
- Other non-2xx, network error, oversized body, invalid URL → failed audit
  with `errorMessage` populated.

### Parser

A small custom parser lives at `src/lib/robots-parser.ts`. Roughly 50 LOC.

1. Split lines, strip `#` comments, trim, drop empty lines.
2. Walk lines accumulating groups. A group is `{ userAgents: string[], rules:
   { type: 'allow' | 'disallow', path: string }[] }`. Consecutive
   `User-agent:` lines share the next rule block. A new `User-agent:` after
   rules starts a new group.
3. Ignore unrecognized directives (e.g. `Sitemap:`, `Crawl-delay:`).
4. Never throw on malformed input — skip the line.

### Per-bot evaluation

For each name in `KNOWN_AI_BOTS`:

1. Find the most-specific matching group via longest case-insensitive exact
   UA match. If multiple groups match equally, the first wins.
2. If no specific match exists, return `{ status: 'default' }`. The `*` group
   is **not** treated as an explicit per-bot decision.
3. Within the matched group, evaluate `/`:
   - A `Disallow: /` rule (after applying the spec's "longest match wins,
     Allow wins ties" rule for the root) → `{ status: 'blocked' }`.
   - No `Disallow` rules at all → `{ status: 'allowed' }`.
   - `Disallow` rules exist but none block `/` → `{ status: 'partial',
     disallowedPaths: [...non-root Disallow paths] }`. If the only `Disallow`
     was on `/` and was overridden by `Allow: /`, no non-root disallows remain
     → `{ status: 'allowed' }`.

Wildcard paths (e.g. `Disallow: /*.json`) are not expanded for the root check.
Their presence in a group counts as evidence of "partial" but they are listed
verbatim in `disallowedPaths`.

## Shared Library

`src/lib/crawler-audit.ts` exports:

```ts
export async function runCrawlerAudit(params: {
  siteId: number;
  trigger: 'generation' | 'manual';
  generationId?: number;
}): Promise<CrawlerAudit>;
```

Behavior:

1. Resolves the site's `rootUrl` from the `sites` table (404s if site doesn't
   exist).
2. Calls a `fetchRobots(rootUrl)` helper that returns `{ ok: true, body,
   robotsUrl } | { ok: false, error, robotsUrl }`.
3. If fetch succeeded: parse + evaluate per bot, build `results`.
4. If fetch failed: build a `default`-everywhere `results` for 404, otherwise
   skip results.
5. Insert a `crawler_audits` row and return it.
6. Never throws — internal errors become `status: 'failed'` rows.

Both the on-demand API endpoint and the workflow step call this function.

## API Endpoints

### `POST /api/sites/:id/audits`

Auth: `getCurrentUser` + verify the site belongs to the caller (mirrors
existing `/api/sites/:id/*` patterns).

Action: calls `runCrawlerAudit({ siteId, trigger: 'manual' })` and returns the
new row as JSON.

Response: 200 with `{ audit: CrawlerAudit }`. 404 if site not found / not
owned. 401 if unauthenticated.

### `GET /api/sites/:id/audits/latest`

Auth: same as above.

Action: returns the latest `crawler_audits` row for the site ordered by
`fetchedAt DESC`.

Response: 200 with `{ audit: CrawlerAudit }` or 404 if no audit exists yet.

No list endpoint in v1.

## Workflow Integration

The existing generation workflow lives under
`src/app/.well-known/workflow/v1/...`. We add a new step, `auditCrawlers`:

- Runs **after** the main llms.txt generation succeeds. (A failed generation
  is skipped — no audit row is written.)
- Calls `runCrawlerAudit({ siteId, trigger: 'generation', generationId })`.
- Catches any error internally and logs it. Never re-throws. The generation
  workflow's overall status is unaffected.

## UI

### Tab placement

The site detail page (`src/app/(app)/sites/[id]/site-detail-client.tsx`)
already uses `<Tabs>`. We add a new `AICrawlers` tab alongside the existing
tabs. The tab's content is rendered by `CrawlerAuditTab.tsx`.

### `CrawlerAuditTab.tsx`

Container component. Uses TanStack Query with key
`['sites', siteId, 'audit', 'latest']` to fetch the latest audit.

States:

- **Loading** — skeleton row.
- **Empty** (404 from latest endpoint, i.e., never audited): empty state with
  copy "No audit yet. Click 'Run audit now' to check your robots.txt." plus a
  button that triggers the POST mutation.
- **Failed** (latest audit has `status: 'failed'`): error card with
  `errorMessage` plus a "Retry" button (same mutation). The generator is still
  visible, seeded with all bots = `default`.
- **Succeeded**: header row + summary chips + audit table + generator.

Mutation on success: invalidates the latest-audit query so the tab re-renders
with the new row.

### Header row

- Title: "AI Crawler Audit"
- Right side: `Last checked <relative time>` plus a "Re-audit" button.

### Summary chips

A single line: `3 allowed · 2 blocked · 1 partial · 3 default`. Counts derive
from the `results` object.

### `CrawlerAuditTable.tsx`

Pure presentational. Receives the parsed `results` and renders a row per bot
in `KNOWN_AI_BOTS` order.

Columns:

- Bot name (monospace, font-code).
- Status pill: rounded full, caption-uppercase 10px, colored per the palette
  in the decisions table.
- Detail text: empty for `allowed`/`blocked`; comma-separated
  `disallowedPaths` for `partial`; "Falls under * rules" for `default`.

### `RobotsGenerator.tsx`

State: a local map `{ [botName]: 'allow' | 'block' | 'default' }`, seeded
from the audit's `results.status`.

UI:

- Heading "Generate the directives you want" plus subhead.
- Two columns at desktop, stacked on mobile:
  - **Toggles**: nine rows. Each row: bot name + a tri-state-ish control
    showing `Allow` / `Block` (with the current state highlighted). Clicking
    the highlighted state again resets that bot to `default`.
  - **Snippet preview**: monospace block rendering the generated
    `robots.txt`. Updates live as toggles change. Includes a header comment
    with the date.
- "Copy snippet" button — calls `navigator.clipboard.writeText`. Disabled if
  the snippet is empty (all bots = default).
- "Reset to current state" button — re-seeds state from the audit's
  `results`.

### Snippet format

```
# Generated by AI Ready — 2026-05-13
# Append to your existing robots.txt.

# Allowed AI crawlers
User-agent: GPTBot
User-agent: ClaudeBot
Allow: /

# Blocked AI crawlers
User-agent: CCBot
User-agent: Bytespider
Disallow: /
```

- Bots set to `default` are omitted entirely.
- If only one bot is in a category, the comment group still wraps it.
- If no allows and no blocks, the snippet is just the header comment plus
  "# (No directives — toggle a bot to begin)" placeholder.

## Error Handling Summary

| Failure | Handling |
|---|---|
| Robots.txt fetch fails (5xx, network, timeout) | `status='failed'` audit row with `errorMessage`. UI shows error card. |
| Robots.txt is 404 | `status='succeeded'`, every bot = `default`. |
| Body exceeds 512 KB | Treated as failed audit with a descriptive message. |
| Malformed robots.txt lines | Parser silently skips. |
| Concurrent re-audits | Both insert rows. UI uses latest by `fetchedAt`. No locking. |
| Workflow step error | Caught and logged inside the step. Generation status unaffected. |
| Generation deletion while audit exists | `generationId` becomes `NULL` (`ON DELETE SET NULL`). Audit row survives. |
| Site deletion | Cascades to `crawler_audits`. |

## Testing

### Parser (`src/lib/robots-parser.test.ts`)

Fixture-driven Vitest tests in `src/lib/__fixtures__/robots/`:

- `empty.txt` → every bot = `default`.
- `block-all-ai.txt` → all nine bots = `blocked`.
- `allow-all.txt` (only `User-agent: *` and `Allow: /`) → every bot = `default`.
- `mixed.txt` → known mix (GPTBot blocked, ClaudeBot allowed, CCBot partial).
- `partial-paths.txt` → `Disallow: /admin` for one bot → status `partial` with
  `disallowedPaths: ['/admin']`.
- `wildcard-paths.txt` → `Disallow: /*.json` → status `partial`.
- `allow-overrides-disallow.txt` → `Disallow: /` + `Allow: /` → status
  `allowed`.
- `malformed.txt` → garbage lines silently skipped, valid lines still parsed.

### Audit library (`src/lib/crawler-audit.test.ts`)

Mock the fetch helper:

- 200 OK with body → `status='succeeded'` row written, `results` matches
  parser output.
- 404 → `status='succeeded'`, all bots = `default`, `robotsContent` is null.
- 500 → `status='failed'`, `errorMessage` populated.
- Timeout → `status='failed'`.
- Oversized body → `status='failed'` with size-limit message.
- Invalid site URL → returns failed row, never throws.

### API routes

Mirror existing `route.test.ts` patterns:

- `POST /api/sites/:id/audits.test.ts` — 401 unauth, 404 wrong owner, 200
  returns new audit row.
- `GET /api/sites/:id/audits/latest.test.ts` — 401, 404 when no audit, 200
  with latest row.

### Components

- `CrawlerAuditTab.test.tsx` — loading, empty, failed, succeeded states.
- `CrawlerAuditTable.test.tsx` — renders nine rows, correct status pills,
  detail text per status.
- `RobotsGenerator.test.tsx` — toggle updates snippet, "Reset" restores
  initial, "Copy" calls clipboard, empty state when all default.

### Workflow

Unit test on the step itself — asserts it calls `runCrawlerAudit` and that a
thrown error doesn't propagate. The existing workflow harness's testing
approach applies.

### Gates

- `pnpm test` passes.
- `pnpm build` passes locally.
- `pnpm db:generate` produces a clean migration that is included in the PR.

## Open Items (deferred, not blockers)

- Audit history UI (we already store history, just no UI for it).
- Per-bot path customization in the generator.
- Push-to-site flow (writing the snippet back to the user's robots.txt).
- Retention/cleanup for old audit rows.
- Rate limiting on the re-audit endpoint.

## File Inventory (rough)

New files:

- `src/db/schema.ts` — append `crawlerAudits` table.
- `drizzle/<timestamp>_crawler_audits.sql` — generated migration.
- `src/lib/known-ai-bots.ts` — `KNOWN_AI_BOTS` constant.
- `src/lib/robots-parser.ts` + `.test.ts` + `__fixtures__/robots/*.txt`.
- `src/lib/crawler-audit.ts` + `.test.ts`.
- `src/app/api/sites/[id]/audits/route.ts` (POST) + `.test.ts`.
- `src/app/api/sites/[id]/audits/latest/route.ts` (GET) + `.test.ts`.
- `src/components/crawlers/crawler-audit-tab.tsx` + `.test.tsx`.
- `src/components/crawlers/crawler-audit-table.tsx` + `.test.tsx`.
- `src/components/crawlers/robots-generator.tsx` + `.test.tsx`.
- Workflow step file in `src/app/.well-known/workflow/v1/...` (exact path
  determined during implementation).

Modified files:

- `src/app/(app)/sites/[id]/site-detail-client.tsx` — add tab.
- Existing workflow definition — register the new step.
