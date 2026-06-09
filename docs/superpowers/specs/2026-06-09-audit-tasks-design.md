# Audit Tasks — Design

**Date:** 2026-06-09
**Status:** Approved for planning

## Summary

Turn failing audit findings into a per-site task list. Each failing check in the
site's audits gets an "Add task" button; tasks are worked from a new **Tasks**
panel on the site detail page. Tasks can be checked off manually, are
auto-verified when a newer audit shows the underlying check passing, and can be
flagged **won't do** when a client declines the suggestion.

## Goals

- Hand-pick failing findings into a persistent, per-site task list.
- One click from a failing check to a task; one glance to see what's left.
- Close the loop: when a re-audit shows the check passing, the task is marked
  `verified` automatically.
- Record decisions: `wont_do` captures "the client doesn't want this" and stops
  the same suggestion from nagging forever.

## Non-goals (v1)

- Free-form manual tasks not tied to an audit finding.
- Notes, due dates, assignees, or any multi-user workflow.
- A global cross-site tasks page (per-site only in v1).
- Pushing reconciliation into the audit pipelines (reconcile happens on read).

## Background: finding shapes

All audit surfaces already produce findings with a **stable id, optional page
URL, and fix text**:

| Panel | Source | Shape |
|---|---|---|
| Readable | `citation_audits.results` (per site + pageUrl) | `CheckResult { id, passed, evidence[], recommendation }` |
| Recommendable | `site_geo_audits.results` (per site) | `GeoSignalResult { signal, present, recommendation }` |
| Recognized | `crawler_audits` (per site) | per-bot access findings |
| Setup | robots/llms.txt setup guidance | static setup steps |

This convergence is what makes a single generic task model work.

## Data model

New table `site_tasks` in `src/db/schema.ts`, following house conventions
(`id` autoincrement + `uid` via `generateUid`, site FK with cascade delete):

| Column | Type | Notes |
|---|---|---|
| `id` | integer PK autoincrement | |
| `uid` | text unique | `generateUid()` |
| `siteId` | integer FK → `sites.id` | `onDelete: 'cascade'` |
| `sourceType` | text enum | `'citation-check' \| 'geo-signal' \| 'crawler-audit' \| 'setup'` |
| `sourceId` | text | stable check/signal id, e.g. `schema-org-type` |
| `pageUrl` | text, **not null, default `''`** | page-scoped findings set the URL; site-level findings use `''`. Not nullable because SQLite treats NULLs as distinct in unique indexes, which would break dedup. |
| `title` | text | human-readable check name at creation time |
| `foundText` | text | snapshot of the "Found:" evidence |
| `fixText` | text | snapshot of the "Fix:" recommendation |
| `status` | text enum | `'open' \| 'done' \| 'verified' \| 'wont_do'` |
| `createdAt` | text | `current_timestamp` default |
| `statusChangedAt` | text | updated on every status change |

Indexes:

- **Unique** on `(siteId, sourceType, sourceId, pageUrl)` — one task per finding,
  ever. Creation is idempotent against this key.
- Non-unique on `(siteId, status)` for the list view and open-count badge.

Snapshot fields (`title`/`foundText`/`fixText`) are intentionally denormalized:
the task must still read sensibly after the page content or check output
changes.

## Lifecycle

```
            ┌────────── manual check-off ──────────┐
            ▼                                      │
open ──► done                                      │
  │         │                                      │
  │         └── reconcile: check passes ──► verified
  │                                            ▲
  ├──────── reconcile: check passes ───────────┘
  │
  ├──► wont_do ──► open   (manual flag / manual reopen)
```

- `open → done`: manual checkbox.
- `open|done → verified`: set by reconcile-on-read when the latest audit shows
  the source check passing. `verified` is system-set only — no manual path.
- `open → wont_do` and `wont_do → open`: manual. **Reconcile never touches
  `wont_do`**, even if the check later passes — it stays as a record of the
  decision.
- Any task — including `verified` — can be manually reopened via
  `PATCH { status: 'open' }`. This covers the regression case: if a check
  passes, then fails again later, the existing task (the unique key blocks a
  duplicate) is reopened from the Tasks panel.

### Reconcile-on-read

`GET /api/sites/[id]/tasks` runs reconciliation before returning:

1. Load the site's `open` and `done` tasks.
2. Group by `sourceType` and dispatch to a **reconciler adapter** per type:
   - `citation-check`: load the latest `citation_audits` row per distinct
     `pageUrl` among the tasks, parse `results`, and map check `id → passed`.
   - `geo-signal`: load the latest `site_geo_audits` row, map
     `signal → present`.
3. Tasks whose source check now passes are updated to `verified` (single batch
   update), then the full list is returned.

Adapters live in `src/lib/tasks/reconcile.ts` as pure functions
(`(tasks, auditResults) => uidsToVerify`) so the matching logic is unit-testable
without a database.

**v1 adapter coverage:** `citation-check` and `geo-signal`. Tasks created from
Recognized/Setup findings are fully supported for creation and manual
completion, but reconcile treats them as manual-only until their adapters are
added (the adapter interface makes that an additive change).

## API

REST routes returning JSON, consumed via TanStack Query (per CLAUDE.md — no
server actions). All routes auth-guard and verify site ownership, matching
existing `/api/sites/[id]/*` routes.

- `GET /api/sites/[id]/tasks`
  Reconciles, then returns `{ tasks: Task[] }` ordered: `open` (newest first),
  `done`, `verified`, `wont_do`.
- `POST /api/sites/[id]/tasks`
  Body: `{ sourceType, sourceId, pageUrl?, title, foundText, fixText }`.
  Idempotent on the unique key: if a task already exists for the key, returns
  the existing task with `200` (no duplicate, no error) so the button can
  simply render the existing status.
- `PATCH /api/sites/[id]/tasks/[taskUid]`
  Body: `{ status: 'open' | 'done' | 'wont_do' }`. `verified` is rejected
  (system-set only). Updates `statusChangedAt`.

Client hooks in `src/hooks/use-site-tasks.ts`:
`useSiteTasks(siteUid)` (query, key `['siteTasks', siteUid]`),
`useCreateTask(siteUid)` / `useUpdateTaskStatus(siteUid)` (mutations that
invalidate the query).

## UI

### 1. "Add task" button per failing finding

A compact `AddTaskButton` component
(`src/components/tasks/add-task-button.tsx`) rendered on:

- failing citation check rows in `citations-page-detail.tsx`
  (`sourceType: 'citation-check'`, `pageUrl` = audited page)
- absent geo signal rows in `geo-signal-list.tsx` (`sourceType: 'geo-signal'`)
- actionable findings in the Recognized and Setup panels

Props carry the normalized finding payload. The button reads
`useSiteTasks(siteUid)` from the cache and renders by existing-task status:

| Task state | Button renders |
|---|---|
| none | `+ Add task` (creates on click) |
| `open` | `Added ✓` (disabled-styled, links to Tasks tab) |
| `done` / `verified` | `Done` (subtle) |
| `wont_do` | `Won't do` (subtle) |

Styling follows DESIGN.md: hairline borders, no drop shadows, no orange (it is
not a primary CTA).

### 2. Tasks panel

- New `tasks` entry appended to `VALID_TABS` / `tabItems` in
  `site-detail-client.tsx`, so it appears in the site sidebar nav and is
  URL-backed via `?tab=tasks` like the other panels.
- The sidebar link shows an **open-task count badge** (from `useSiteTasks`),
  styled like the existing "soon" pill but using neutral tokens.
- `TasksPanel` (`src/components/tasks/tasks-panel.tsx`) renders inside the
  standard content card, grouped by status:
  1. **Open** — checkbox (→ `done`), a "Won't do" secondary action, fix text
     visible, source link.
  2. **Done / Verified** — checked rows with a "Reopen" action; `verified`
     gets a small badge noting the confirming audit ("Verified by audit").
  3. **Won't do** — dimmed, collapsed group with a "Reopen" action.
- Each task deep-links to its source: citation-check tasks →
  `?tab=readable&page=<path>`; geo-signal → `?tab=recommendable`; etc.
  (Citation tasks store `pageUrl`; the link resolves the manifest path for that
  URL via the page workspace data already loaded on the page.)
- Empty state: "No tasks yet — add one from any failing audit check."

## Testing

Per CLAUDE.md, every component gets a test file:

- `src/lib/tasks/reconcile.test.ts` — pure adapter logic: passing check
  verifies open and done tasks, never `wont_do`; unknown source types are left
  alone.
- Route tests for GET (reconcile + ordering), POST (creation, idempotency on
  the unique key), PATCH (status transitions, `verified` rejected) following
  existing API route test patterns.
- `add-task-button.test.tsx` — all four render states + create call.
- `tasks-panel.test.tsx` — grouping, check-off, won't-do, reopen, empty state.
- `site-detail-client` test additions for the new tab entry.

Migration via `pnpm db:generate` / `pnpm db:migrate`.

## Open questions

None — design approved 2026-06-09.
