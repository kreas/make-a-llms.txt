# Pages Right-Rail — Design Spec

**Date:** 2026-06-05
**Status:** Approved (pending spec review)

## 1. Goal

On the project (site detail) page, the per-page selector (`PagesTree`) is currently
rendered **inside** both the Readable and Recognized panels — duplicated, and only
present on those two tabs. Lift it into a single shared, always-visible **right-rail**:
a floating white rounded card on the right that lists the sitemap pages once and drives
the shared page selection across the page-specific tabs. Rebuild the tree itself on a
**headless-tree** primitive (the shadcn-style `Tree` component the user supplied).

## 2. Current state (verified)

- `src/app/(app)/sites/[id]/site-detail-client.tsx` renders a "gooey folder" Tabs
  container: **Overview, Readable, Recommendable, Recognized, Setup**.
- `PageWorkspaceProvider` (`page-workspace-context.tsx`) already loads the sitemap
  manifest (`/api/generations/<uid>/pages`) and exposes `pages`, `manifestPending`,
  `selectedPath`, `setSelectedPath`. It currently wraps **only** the content area.
- `ReadablePanel` and `RecognizedPanel` each render their own `<PagesTree>` in a
  `[280px 1fr]` grid (tree + detail). These are the duplicated selectors.
- `OverviewPanel`, `RecommendablePanel`, `SetupPanel` are site/generation-level.
- `pages-tree.tsx` owns the nesting logic (`buildTree`: split `path` on `/`, folder/leaf
  nodes, `okCount/total` tally, index-first + alpha sort) and renders custom buttons with
  per-page status dots (ok/failed/skipped) and folder `(ok/total)` counts.
- Dependencies present: `radix-ui` (unified, exports `Slot`) and `lucide-react`. The
  codebase already imports `from "radix-ui"` (see `ui/tabs.tsx`). **Not** present:
  `@headless-tree/core`, `@headless-tree/react`. No `src/components/ui/tree.tsx` yet.

## 3. Decisions (from brainstorming)

- **Visibility:** rail is **always visible** on every tab (stable two-column layout).
- **Selection:** selecting a page updates shared `selectedPath` only; does **not** switch tabs.
- **URL-backed selection:** the selected page is reflected in a `?page=<path>` query param
  so a refresh (or a shared/bookmarked URL) restores the same page instead of resetting to
  the index. Selection writes the param; load reads it.
- **Tree implementation:** use the supplied headless-tree `Tree`/`TreeItem`/`TreeItemLabel`
  primitive (`src/components/ui/tree.tsx`) driven by `@headless-tree/react`'s `useTree`.
- **Status signals:** keep the per-page status dot (ok/failed/skipped) **and** folder
  `(ok/total)` counts, styled with DESIGN tokens.
- **Filter:** add a small search/filter input at the top of the rail (headless-tree
  `searchFeature`).
- **Responsive:** **desktop-first / desktop-only.** Two-column at `md+`; below `md` the
  rail simply stacks below the content (single column). No mobile disclosure, no special
  small-screen treatment.

## 4. Architecture

### 4.1 Lift the provider

Move `PageWorkspaceProvider generation={selected}` up so it wraps both the folder column
and the rail (today it wraps only the content panels). Single source for selection +
manifest. The manifest API is unchanged; the provider's selection internals change for the
URL backing (below).

**URL-backed selection (inside `page-workspace-context.tsx`).** The provider becomes the
single owner of read/write to a `?page=<path>` query param using `next/navigation`
(`useSearchParams`, `useRouter`, `usePathname` — the page is already a client tree using
`useSearchParams`):

- **Read:** the effective `selectedPath` derives from `searchParams.get('page')` when that
  value is a known page in the manifest; otherwise fall back to the existing default
  (`index` if present, else first page). Replaces today's local `manualSelected` state as
  the source of truth.
- **Write:** `setSelectedPath(path)` calls `router.replace` with the merged search params
  (preserve any existing params such as `action`), `{ scroll: false }`, and an
  `encodeURIComponent`'d path value (page paths contain `/`). Use `replace` (not `push`) so
  page clicks don't stack history entries.
- Decode the param on read. Unknown/stale `?page` values fall through to the default with
  no error.

### 4.2 Dependencies + tree primitive

- Add `@headless-tree/core` and `@headless-tree/react`.
- Add `src/components/ui/tree.tsx` = the user-supplied `Tree`/`TreeItem`/`TreeItemLabel`/
  `TreeDragLine` primitive verbatim, with two adjustments:
  - The supplied `import { ItemInstance } from "@headless-tree/core"` and
    `import { Slot } from "radix-ui"` are kept (both resolve in this repo).
  - Replace the raw `in-data-[search-match=true]:bg-blue-50!` with a DESIGN token
    (a soft highlight, e.g. `bg-timeline-read`/`bg-canvas-soft`) so no off-palette color
    enters the system.
- **Plan must verify the current `@headless-tree/react` API** (`useTree`, feature plugins
  `syncDataLoaderFeature`, `selectionFeature`, `hotkeysCoreFeature`, `searchFeature`)
  against headless-tree docs before wiring — the API is library-versioned and must not be
  guessed.

### 4.3 Tree data adapter

Extract the nesting/sort/tally logic out of `pages-tree.tsx` into a pure, tested helper
`src/components/generations/pages-tree-data.ts`:

- `buildTree(pages: ManifestPage[]): TreeNode[]` (folders + leaves, `okCount/total`,
  index-first + alpha sort) — moved verbatim, plus a flattener that headless-tree's data
  loader needs: a stable `id` per node, `getChildren(id)`, `getItem(id)`, `isFolder`,
  display `name`, and the per-leaf `ManifestPage` (for the status dot) / per-folder
  `okCount,total` (for the count). Leaf `id` = the page `path`; folder `id` = its path
  prefix.
- Keep the `ManifestPage` type export here (it's imported widely).

### 4.4 `PagesRail`

`src/components/generations/pages-rail.tsx` (+ `.test.tsx`). Consumes `usePageWorkspace()`.

- Card: `bg-surface-card`, `rounded-2xl`, `border border-hairline`, soft float
  (`shadow-[0_8px_30px_rgba(0,0,0,0.05)]`), `sticky top-4`, padded.
- Header: caption-uppercase "Pages" + muted count.
- Filter input: small text field; drives headless-tree search (filters/highlights matches).
- Body states:
  - `manifestPending` → muted "Loading pages…".
  - `pages.length === 0` → muted "No pages yet — run a generation to list pages."
  - else → the headless-tree `Tree`, rows rendered via `TreeItem`/`TreeItemLabel` with:
    folder rows = chevron + name + `(ok/total)`; leaf rows = status dot + name; selected
    leaf highlighted; clicking a leaf calls `setSelectedPath(page.path)`.
- Selection wiring: map headless-tree's selected/activated item id → page path → context.
  Initialize expanded state so the first couple of levels are open (matching today's
  `depth < 2` default).
- Muted text uses `text-muted-strong` (never `text-muted`).

### 4.5 Layout in `site-detail-client.tsx`

Region under the header → responsive grid wrapped by the lifted provider:

- `md+`: `grid-cols-[minmax(0,1fr)_320px] gap-5 items-start`. Left = existing gooey
  folder/tabs/content (internally unchanged). Right = `<PagesRail />` (sticky).
- `<md`: single column; rail stacks below the folder. No disclosure.

### 4.6 Panels

- `ReadablePanel` / `RecognizedPanel`: remove the inline `<PagesTree>` and the left tree
  column; collapse `[280px 1fr]` → single detail column. Keep `usePageWorkspace()` for
  `selectedPath`/`selectedPage` to render the detail.
- `OverviewPanel`, `RecommendablePanel`, `SetupPanel`: unchanged (render narrower).

### 4.7 Retire old `PagesTree`

After the rail uses the headless-tree version, `pages-tree.tsx`'s rendering is no longer
used. Remove the old `PagesTree` component (and its now-stale `pages-tree.test.tsx`),
keeping the nesting logic in the new `pages-tree-data.ts` (with its own tests). Confirm no
other importers of `PagesTree` remain before deleting (today: only readable/recognized
panels).

## 5. Data flow

Unchanged at the data layer. `PageWorkspaceProvider` runs the manifest query once;
`PagesRail` + the page panels read `pages`/`selectedPath`/`setSelectedPath` from context.
The rail builds headless-tree data from `pages` via `pages-tree-data.ts`; selecting a node
calls `setSelectedPath`, re-rendering the active page panel's detail.

## 6. Edge cases

- No generation / generation pending → empty `pages` → empty hint.
- Manifest running → `manifestPending` → "Loading pages…".
- Manifest skipped/failed → empty `pages` → empty hint.
- Filter with no matches → "No pages match" (or headless-tree's empty match state).
- Long lists → tree scrolls inside the card; card stays sticky.
- `?page=` absent or pointing at a non-existent page → fall back to the default (index/first),
  no error. Selecting a page then writes/repairs the param.

## 7. Components & tests

New:
- `src/components/ui/tree.tsx` — supplied primitive (token-adjusted). Lightly smoke-tested
  or covered via `PagesRail` tests.
- `src/components/generations/pages-tree-data.ts` (+ test): `buildTree` + flatten/adapter;
  tests for nesting, index-first sort, `okCount/total` tally.
- `src/components/generations/pages-rail.tsx` (+ test): renders pages, loading + empty
  states, filter narrows the list, selecting a leaf calls `setSelectedPath`, status dots +
  folder counts present.

Modified:
- `site-detail-client.tsx`: lift provider, two-column layout, render `PagesRail`.
- `readable-panel.tsx` / `recognized-panel.tsx`: drop inline tree; single-column detail;
  update tests to no longer assert an inline tree.
- `page-workspace-context.tsx`: mount location moves up; selection becomes URL-backed
  (`?page=`) via `next/navigation`. Test the read (initial `?page` selects that page) and
  write (selecting calls `router.replace` with the encoded path) with mocked
  `next/navigation` hooks, plus the unknown-param fallback.

Removed:
- `pages-tree.tsx` and `pages-tree.test.tsx` (logic preserved in `pages-tree-data.ts`).

## 8. Acceptance criteria

- The sitemap page list renders once, in a floating white rounded right-rail, on every tab
  (desktop two-column).
- The tree is built on the headless-tree primitive, with a working filter input, per-page
  status dots, and folder `(ok/total)` counts.
- Readable & Recognized no longer render their own tree; detail spans the full content column.
- Selecting a page in the rail updates the Readable/Recognized detail; it does not switch tabs.
- Selecting a page sets `?page=<path>`; refreshing (or opening that URL) restores the same
  selected page instead of resetting to the index.
- Loading / empty / no-match states render correctly.
- No off-palette colors (search highlight uses a DESIGN token); `text-muted-strong` for muted text.
- `pnpm test` + `pnpm build` pass; new components/helpers have tests.

## 9. Risks / notes

- **headless-tree API drift:** verify `@headless-tree/react` `useTree` + feature-plugin API
  against current docs before coding; do not rely on memorized signatures.
- **Narrow folder column:** the gooey folder tab geometry and Overview's radar/pillar cards
  now render in a `1fr` column beside a 320px rail — visual-check in the preview that tabs
  and the radar still look right.
- **Desktop-only:** below `md` the rail stacks; we are explicitly not investing in a mobile
  layout for this view.
