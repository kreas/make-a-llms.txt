# Pages Right-Rail — Design Spec

**Date:** 2026-06-05
**Status:** Approved (pending spec review)

## 1. Goal

On the project (site detail) page, the per-page selector (`PagesTree`) is currently
rendered **inside** both the Readable and Recognized panels — duplicated, and only
present on those two tabs. Lift it into a single shared, always-visible **right-rail**:
a floating white rounded card on the right that lists the sitemap pages once and drives
the shared page selection across the page-specific tabs.

## 2. Current state (verified)

- `src/app/(app)/sites/[id]/site-detail-client.tsx` renders a "gooey folder" Tabs
  container with tabs: **Overview, Readable, Recommendable, Recognized, Setup**.
- `PageWorkspaceProvider` (`src/components/generations/page-workspace-context.tsx`)
  already loads the sitemap manifest (`/api/generations/<uid>/pages`) and exposes
  `pages`, `manifestPending`, `selectedPath`, `setSelectedPath`. It currently wraps
  **only** the tab content area.
- `ReadablePanel` and `RecognizedPanel` each render their own
  `<PagesTree pages selectedPath onSelect={setSelectedPath} />` in a `[280px 1fr]`
  grid (tree + detail). These are the duplicated selectors.
- `OverviewPanel`, `RecommendablePanel`, `SetupPanel` are site/generation-level and do
  not use the page selector.
- `PagesTree` already uses lucide icons (`FileText`, `Folder`).

## 3. Decisions (from brainstorming)

- **Visibility:** the rail is **always visible** on every tab (stable two-column layout),
  including site-level tabs.
- **Selection behavior:** selecting a page updates shared `selectedPath` only; it does
  **not** auto-switch tabs.
- **Icons:** lucide (already the case in `PagesTree`).
- **Mobile (`<md`):** the rail becomes a collapsible **"Pages (N)" disclosure above the
  folder**, default collapsed.

## 4. Architecture

### 4.1 Lift the provider

Move `PageWorkspaceProvider generation={selected}` **up** so it wraps both the folder
column and the rail (currently it wraps only the content panels). Both consume the same
context, so selection and the manifest query stay single-sourced. No change to the
provider's internals or the manifest API.

### 4.2 New component — `PagesRail`

`src/components/generations/pages-rail.tsx` (+ `.test.tsx`). A presentational card that
consumes `usePageWorkspace()`:

- Container: `bg-surface-card`, `rounded-2xl`, `border border-hairline`, soft float
  (`shadow-[0_8px_30px_rgba(0,0,0,0.05)]`), `sticky top-4`, internal padding.
- Header row: caption-uppercase "Pages" + a muted count (`pages.length`).
- Body:
  - `manifestPending` → muted "Loading pages…".
  - `pages.length === 0` (no generation, or pages skipped/failed) → muted empty hint:
    "No pages yet — run a generation to list pages."
  - otherwise → `<PagesTree pages={pages} selectedPath={selectedPath} onSelect={setSelectedPath} />`.

Uses `text-muted-strong` for muted text (never `text-muted`).

### 4.3 Layout in `site-detail-client.tsx`

The region under the header becomes a responsive two-column grid wrapped by the lifted
provider:

- `md+`: `grid-cols-[minmax(0,1fr)_300px] gap-5 items-start`. Left = the existing gooey
  folder/tabs/content block (unchanged internally). Right = `<PagesRail />` (sticky).
- `<md`: single column. The rail renders as a collapsible disclosure **above** the folder
  — a `PagesRailMobile` treatment (a `<details>`-style "Pages (N)" toggle, default
  collapsed) reusing the same `PagesRail` body. Implementation: render the rail content
  inside a disclosure on small screens and as the sticky card on `md+` (CSS-driven via a
  wrapper, or two render branches keyed off the existing `useScreenSize` hook already
  imported in the file). Prefer the `useScreenSize` hook already in use for consistency.

### 4.4 Panels

- `ReadablePanel`: remove the `<PagesTree>` and the left tree column; collapse the
  `[280px 1fr]` grid to a single detail column. Keep `usePageWorkspace()` for
  `selectedPath`/`selectedPage` and the existing detail rendering. Keep the `manifestPending`
  guard only where it still matters for the detail (it no longer needs to gate a tree).
- `RecognizedPanel`: same change.
- `OverviewPanel`, `RecommendablePanel`, `SetupPanel`: unchanged (they now render
  narrower beside the rail — acceptable).

## 5. Data flow

Unchanged. `PageWorkspaceProvider` runs the manifest query once; `PagesRail` and the
page panels read `pages`/`selectedPath`/`setSelectedPath` from context. Selecting a page
in the rail calls `setSelectedPath`, which re-renders the active page panel's detail.

## 6. Edge cases

- No generation yet / generation pending → `pages` empty, `manifestPending` may be false
  (query disabled) → rail shows the empty hint.
- Manifest running → `manifestPending` true → "Loading pages…".
- Manifest skipped/failed → `pages` empty → empty hint.
- Long page lists → tree scrolls within the card (`max-h` + `overflow-auto`), card stays
  sticky.

## 7. Components & tests

New:
- `src/components/generations/pages-rail.tsx` (+ `pages-rail.test.tsx`): renders pages via
  `PagesTree`, loading state, empty state, and selecting a node calls `setSelectedPath`
  (test by wrapping in a mock provider or by passing a stub context).

Modified:
- `site-detail-client.tsx`: lift provider, add two-column + mobile-disclosure layout,
  render `PagesRail`.
- `readable-panel.tsx` / `recognized-panel.tsx`: drop inline `PagesTree`, single-column
  detail. Update their tests to no longer assert an inline tree is rendered.

Unchanged:
- `pages-tree.tsx` and `pages-tree.test.tsx`.
- `page-workspace-context.tsx` (only its mount location moves).

## 8. Acceptance criteria

- The sitemap page list renders once, in a floating white rounded right-rail, on every
  tab of the site detail page.
- Readable & Recognized panels no longer render their own `PagesTree`; their detail spans
  the full content column.
- Selecting a page in the rail updates the detail shown on Readable/Recognized; it does
  not switch tabs.
- Rail shows loading and empty states correctly.
- On mobile the rail is a collapsible "Pages (N)" disclosure above the content.
- DESIGN tokens only (`text-muted-strong` for muted text); `pnpm test` + `pnpm build`
  pass; new component has a test.

## 9. Risks / notes

- The gooey folder's tab geometry currently assumes near-full width; in a `1fr` column
  beside a 300px rail it has less room. Verify the tab labels and gooey curve still render
  cleanly at the narrower width (visual check in preview).
- Overview's radar + pillar cards and Recommendable's content reflow narrower — acceptable
  per the "always visible" decision, but worth a glance in preview.
