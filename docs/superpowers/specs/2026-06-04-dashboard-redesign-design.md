# Dashboard Redesign — Design Spec

**Date:** 2026-06-04
**Status:** Approved (pending spec review)

## 1. Goal

The product has grown feature-rich (three-pillar AI-readiness scoring, citation
audits, GEO audits). The current dashboard is a thin 3-up grid of site cards
(`/dashboard` → `SitesList` → `SiteCard`). Replace it with an analytics-style
dashboard inside a new left-sidebar app shell, reinterpreting a reference design
the user likes — but rendered entirely in our own brand tokens and built only on
features that actually exist.

We do **not** do SEO. Our three pillars are the scoring axes everywhere:

- **Readable** (AEO) — "Can AI read and quote your pages?"
- **Recommendable** (GEO) — "Will AI pick you when asked to choose?"
- **Recognized** (AIO) — "Does AI already know who you are?"

## 2. Scope

In scope:

- A new sidebar app shell for authenticated `(app)` routes.
- A redesigned `/dashboard` page: three stat cards, an "Audit a URL" strip, and a
  Monitored Websites table.
- Server-side per-site aggregation to populate the table and stat cards.
- A real avg-readiness trend sparkline derived from audit history.

Out of scope:

- Marketing routes (`/`, `/pricing`, `/blog`, `/docs`) keep the existing
  `SiteHeader` top nav. The shell change only applies inside `(app)`.
- Building Audit History / Alerts pages (they appear as disabled "soon" nav items).
- Any new severity model for checks (none exists; we will not invent one).

## 3. App Shell

New components: `src/components/layout/app-shell.tsx` and
`src/components/layout/app-sidebar.tsx`. The `(app)` layout
(`src/app/(app)/layout.tsx`) switches from `SiteHeader` + `SiteFooter` to the
sidebar shell.

Sidebar contents:

- **Brand:** real `public/logo-v4.png` (next/image) + wordmark "AI Readiness".
- **Primary nav (real, linked):**
  - Dashboard → `/dashboard`
  - Websites → `/dashboard` for now (sites live on the dashboard); revisit if a
    dedicated `/sites` index is added later. Mark active by route.
  - Settings → `/settings/api-tokens`
  - Docs → `/docs`
- **Roadmap nav (visible, disabled, "soon" pill):**
  - Audit History
  - Alerts
- **Bottom user menu:** avatar (initials) + email, opens existing `UserMenu`
  behavior (sign out, settings). Billing is reached via Settings; no separate
  billing route is created here.

Active-state styling uses `bg-surface-strong` / `text-ink` per the mockup.
Disabled "soon" items are non-interactive, `text-muted-soft`, with a small
`badge-pill`-style "soon" tag.

Responsive: at `< md` the sidebar collapses to a slide-in drawer toggled by a
hamburger in a slim top bar; at `>= md` it is a fixed 228px column.

## 4. Dashboard Content

`src/app/(app)/dashboard/page.tsx` remains an async **server component** (it
already queries the db directly — this is the established pattern and avoids a
client round-trip on first paint). It loads aggregates and passes plain data to
presentational components.

### 4.1 Stat cards — `src/components/dashboard/stat-card.tsx`

Three cards:

1. **Sites Monitored** — count of the user's sites; sub-meta "N audited this week".
2. **Avg. Readiness** — mean composite score across sites that have any audit;
   delta vs. previous period; includes the sparkline.
3. **Open Issues** — total failing checks across all sites' latest audits.

Sparkline: `src/components/dashboard/readiness-sparkline.tsx`. A small
inline bar/line chart of avg readiness over recent periods (see §5.3).

### 4.2 Audit URL strip — `src/components/dashboard/audit-url-strip.tsx`

A `'use client'` strip: label + URL `<input>` + ink "Audit" button. Submitting
routes to `/sites/new?url=<encoded>` (the add-site flow reads and prefills the
URL). No new creation logic here.

### 4.3 Monitored Websites table — `src/components/dashboard/sites-table.tsx`

Columns: **Website · Score · Readable · Recommendable · Recognized · Issues**.

Per row (`sites-table-row.tsx`):

- **Website:** favicon (falls back gracefully), display name, root url (mono),
  last-audited relative time.
- **Score:** ring showing the composite = **mean of whichever pillars have run**
  (see §5.1). Ring border color by band (success / blue / gold / error).
- **Readable / Recommendable / Recognized:** mini-bar + numeric value; `—` when
  that pillar's audit has not run.
- **Issues:** a count pill ("N issues") plus the single highest-impact next action
  label from `pickNextAction`. "✓ caught up" when there are no failing checks.
- **Never-audited site:** pillar cells show `—`; the Issues cell shows an inline
  **Run audit** action (links into the site's audit flow).

The table **replaces** the `SitesList` / `SiteCard` grid. `AddSiteCard`'s
empty-state role is preserved: when the user has zero sites, the dashboard shows
an empty state prompting them to add their first site (reuse or port
`AddSiteCard`'s copy). `SiteCard` / `SitesList` are removed once nothing imports
them (and their tests with them).

## 5. Data Layer

### 5.1 Composite score

New helper in `src/lib/citation-audit/site-readiness.ts`:

```
compositeScore(scores: SitePillarScores): number | null
```

Returns the rounded mean of the non-null pillar scores
(`readable`, `recommendable`, `recognized`), or `null` if none have run. Unit
tested for: all three present, partial subsets, none present.

### 5.2 Per-site aggregation

A dashboard data function (e.g. `src/lib/services/dashboard.ts`) that, for a
user's sites, returns for each site: `sitePillarScores`, `compositeScore`,
failing-check count, and `pickNextAction` — using the latest citation audits and
the latest GEO audit per site.

Must avoid N+1: fetch the latest citation audits and latest GEO audit for **all**
the user's site ids in batched queries, then group in memory. Reuse existing
serialization (`AuditLike`) so `sitePillarScores` / `pickNextAction` apply
unchanged.

### 5.3 Avg-readiness trend (sparkline)

Compute an avg-readiness series over recent periods from citation/GEO audit
history (`fetchedAt` + score). Bucket by day or week, average the per-site
composite within each bucket, return an ordered numeric series for the sparkline.

**Fallback:** if there is too little history to form a meaningful series (e.g.
fewer than 2 buckets), the sparkline renders a neutral "not enough history yet"
placeholder rather than a misleading shape. This keeps the heaviest data piece
from blocking the rest of the redesign.

### 5.4 Open Issues total

Sum of failing checks across all sites' latest citation audits (and failing GEO
signals where a GEO audit exists). Exposed from the same aggregation pass.

## 6. Visual System

All surfaces use DESIGN.md tokens — no inline hex:

- Cream `bg-canvas` floor; sidebar on `bg-canvas-soft`; cards `bg-surface-card`.
- Warm `text-ink` headings at weight 400 with negative tracking (display utils).
- **Orange (`bg-primary`) stays scarce** — reserved for the brand mark and at most
  one CTA accent. The "Audit" button is the ink CTA (`button-download` style),
  not orange.
- **No drop shadows** on inner UI; depth from hairlines + cream-on-white.
- Score/pillar status colors use semantic tokens (`success` / `error`) plus a
  restrained blue/gold for mid bands; never the timeline pastels (those stay
  scoped to in-product agent timelines).
- JetBrains Mono for urls and numeric/code surfaces.

## 7. Components & Tests

Each component gets a co-located `.test.tsx` (CLAUDE.md rule). New files:

- `src/components/layout/app-shell.tsx` (+ test)
- `src/components/layout/app-sidebar.tsx` (+ test) — renders nav, marks active
  route, renders disabled "soon" items, renders user menu.
- `src/components/dashboard/stat-card.tsx` (+ test)
- `src/components/dashboard/readiness-sparkline.tsx` (+ test) — incl. the
  low-history placeholder branch.
- `src/components/dashboard/audit-url-strip.tsx` (+ test) — routes with encoded url.
- `src/components/dashboard/sites-table.tsx` (+ test)
- `src/components/dashboard/sites-table-row.tsx` (+ test) — full, partial, and
  never-audited rows.

Logic tests (vitest):

- `compositeScore` in `site-readiness.test.ts`.
- Dashboard aggregation / trend bucketing in `dashboard.test.ts` (or alongside the
  service), including N-sites batching and the low-history fallback.

`/sites/new` is updated to read `?url=` and prefill the add-site form; covered by
its existing test file.

## 8. Acceptance Criteria

- Authenticated `(app)` routes render inside the sidebar shell; marketing routes
  unchanged.
- `/dashboard` shows three stat cards (with a real or fallback sparkline), the
  audit-url strip, and the Monitored Websites table.
- Table rows correctly show full, partial (`—`), and never-audited (Run audit)
  states; Score = mean of scored pillars; Issues = count + next action.
- No N+1 query across sites.
- Orange used only on the brand mark / at most one accent; no inner drop shadows.
- `pnpm test` and `pnpm build` pass; every new component has a test.

## 9. Risks / Notes

- **Sparkline history** is the heaviest piece; the §5.3 fallback de-risks it.
- **"Websites" nav** points at `/dashboard` until a dedicated sites index exists —
  acceptable for now, flagged for later.
- Removing `SiteCard` / `SitesList` must not leave dangling imports; verify before
  deleting.
