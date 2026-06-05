# Pages Right-Rail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the duplicated per-tab page selector into a single always-visible floating right-rail on the site detail page, rebuild the tree on the headless-tree primitive (with status dots, folder counts, and a filter), and back the selected page with a `?page=` URL param so refresh restores it.

**Architecture:** Lift `PageWorkspaceProvider` to wrap both the folder column and the rail; make its selection URL-backed. Extract page-nesting logic into a pure, tested `pages-tree-data.ts` adapter that feeds headless-tree's `syncDataLoaderFeature`. A new `PagesRail` renders the tree via the supplied `ui/tree.tsx` primitive. Readable/Recognized panels drop their inline tree; the old `PagesTree` is retired.

**Tech Stack:** Next.js 16 (App Router, client components), TypeScript, `@headless-tree/core` + `@headless-tree/react`, `radix-ui` (Slot, already installed), lucide-react, Tailwind v4 + DESIGN.md tokens, Vitest + RTL.

**Spec:** `docs/superpowers/specs/2026-06-05-pages-right-rail-design.md`

**IMPORTANT — headless-tree API:** The code below targets the documented `@headless-tree/react` API (`useTree` config: `rootItemId`, `getItemName`, `isItemFolder`, `dataLoader.getItem/getChildren`, `indent`, `initialState.{expandedItems,selectedItems}`, `onPrimaryAction`, `features`; render via `tree.getContainerProps()` + `tree.getItems()`; items expose `getId/getProps/getItemMeta().level/isFolder/isExpanded/isSelected/getItemData/isMatchingSearch`; search via `tree.isSearchOpen()/getSearchInputElementProps()`). After installing (Task 1), the implementer MUST confirm these signatures against the installed package's `.d.ts` types (`node_modules/@headless-tree/react`, `node_modules/@headless-tree/core`) and adjust call sites if a name differs — keep the structure, fix the surface.

---

## File Structure

**Create**
- `src/components/ui/tree.tsx` — the supplied headless-tree primitive (token-adjusted).
- `src/components/generations/pages-tree-data.ts` (+ `.test.ts`) — `ManifestPage` type + `buildPageTreeData` adapter + `ancestorFolderIds` + `initialExpandedIds`.
- `src/components/generations/pages-rail.tsx` (+ `.test.tsx`) — the floating rail (tree + filter + states).

**Modify**
- `src/components/generations/page-workspace-context.tsx` — URL-backed selection; import `ManifestPage` from `./pages-tree-data`.
- `src/app/(app)/sites/[id]/site-detail-client.tsx` — lift provider, two-column layout, render `PagesRail`.
- `src/components/generations/readable-panel.tsx` / `recognized-panel.tsx` — drop inline tree, single-column detail.
- `src/components/generations/readable-panel.test.tsx` / `recognized-panel.test.tsx` — drop tree assertions.

**Delete** (Task 7, after nothing imports them)
- `src/components/generations/pages-tree.tsx` + `pages-tree.test.tsx`

---

## Task 1: Install headless-tree + add the `ui/tree.tsx` primitive

**Files:**
- Modify: `package.json` (via pnpm)
- Create: `src/components/ui/tree.tsx`

- [ ] **Step 1: Install the packages**

Run: `pnpm add @headless-tree/core @headless-tree/react`
Expected: both added to `dependencies`, lockfile updated.

- [ ] **Step 2: Confirm the installed API** (no code yet — read the types)

Run: `ls node_modules/@headless-tree/react/dist && sed -n '1,40p' node_modules/@headless-tree/react/dist/index.d.ts`
Expected: confirms `useTree` is exported. Skim `@headless-tree/core` exports for `syncDataLoaderFeature`, `selectionFeature`, `hotkeysCoreFeature`, `searchFeature`. If any symbol name differs from this plan, note it and use the real name throughout.

- [ ] **Step 3: Create `src/components/ui/tree.tsx`** — paste the supplied primitive verbatim EXCEPT change the one off-palette search-match color to a DESIGN token. Full file:

```tsx
"use client"

import * as React from "react"
import { ItemInstance } from "@headless-tree/core"
import { ChevronDownIcon } from "lucide-react"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

interface TreeContextValue<T = unknown> {
  indent: number
  currentItem?: ItemInstance<T>
  tree?: unknown
}

const TreeContext = React.createContext<TreeContextValue>({
  indent: 20,
  currentItem: undefined,
  tree: undefined,
})

function useTreeContext<T = unknown>() {
  return React.useContext(TreeContext) as TreeContextValue<T>
}

interface TreeProps extends React.HTMLAttributes<HTMLDivElement> {
  indent?: number
  tree?: { getContainerProps?: () => Record<string, unknown> }
}

function Tree({ indent = 20, tree, className, ...props }: TreeProps) {
  const containerProps =
    tree && typeof tree.getContainerProps === "function"
      ? tree.getContainerProps()
      : {}
  const mergedProps = { ...props, ...containerProps }
  const { style: propStyle, ...otherProps } = mergedProps as React.HTMLAttributes<HTMLDivElement>
  const mergedStyle = {
    ...propStyle,
    "--tree-indent": `${indent}px`,
  } as React.CSSProperties

  return (
    <TreeContext.Provider value={{ indent, tree }}>
      <div
        data-slot="tree"
        style={mergedStyle}
        className={cn("flex flex-col", className)}
        {...otherProps}
      />
    </TreeContext.Provider>
  )
}

interface TreeItemProps<T = unknown> extends React.HTMLAttributes<HTMLButtonElement> {
  item: ItemInstance<T>
  asChild?: boolean
}

function TreeItem<T = unknown>({
  item,
  className,
  asChild,
  children,
  ...props
}: TreeItemProps<T>) {
  const { indent } = useTreeContext<T>()
  const itemProps = typeof item.getProps === "function" ? item.getProps() : {}
  const mergedProps = { ...props, ...itemProps }
  const { style: propStyle, ...otherProps } = mergedProps as React.HTMLAttributes<HTMLButtonElement>
  const mergedStyle = {
    ...propStyle,
    "--tree-padding": `${item.getItemMeta().level * indent}px`,
  } as React.CSSProperties

  const Comp = asChild ? Slot.Root : "button"

  return (
    <TreeContext.Provider value={{ indent, currentItem: item }}>
      <Comp
        data-slot="tree-item"
        style={mergedStyle}
        className={cn(
          "z-10 ps-(--tree-padding) outline-hidden select-none not-last:pb-0.5 focus:z-20 data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
          className
        )}
        data-focus={typeof item.isFocused === "function" ? item.isFocused() || false : undefined}
        data-folder={typeof item.isFolder === "function" ? item.isFolder() || false : undefined}
        data-selected={typeof item.isSelected === "function" ? item.isSelected() || false : undefined}
        data-search-match={typeof item.isMatchingSearch === "function" ? item.isMatchingSearch() || false : undefined}
        aria-expanded={item.isExpanded()}
        {...otherProps}
      >
        {children}
      </Comp>
    </TreeContext.Provider>
  )
}

interface TreeItemLabelProps<T = unknown> extends React.HTMLAttributes<HTMLSpanElement> {
  item?: ItemInstance<T>
}

function TreeItemLabel<T = unknown>({
  item: propItem,
  children,
  className,
  ...props
}: TreeItemLabelProps<T>) {
  const { currentItem } = useTreeContext<T>()
  const item = propItem || currentItem
  if (!item) return null

  return (
    <span
      data-slot="tree-item-label"
      className={cn(
        "in-focus-visible:ring-ring/50 bg-surface-card hover:bg-canvas-soft in-data-[selected=true]:bg-timeline-read in-data-[selected=true]:text-ink in-data-[drag-target=true]:bg-canvas-soft flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-body transition-colors not-in-data-[folder=true]:ps-7 in-focus-visible:ring-[3px] in-data-[search-match=true]:bg-timeline-read/40 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        className
      )}
      {...props}
    >
      {item.isFolder() && (
        <ChevronDownIcon className="text-muted-strong size-4 in-aria-[expanded=false]:-rotate-90" />
      )}
      {children || (typeof item.getItemName === "function" ? item.getItemName() : null)}
    </span>
  )
}

export { Tree, TreeItem, TreeItemLabel }
```

(Notes: dropped the unused `TreeDragLine`/`tree` prop drag path — we don't enable drag-and-drop. Selection + search highlights use DESIGN tokens `bg-timeline-read` / `bg-canvas-soft` / `text-ink` instead of `bg-accent`/`bg-blue-50`. If a class like `in-data-[...]` errors under this Tailwind v4 setup, fall back to a `data-[selected=true]:` variant on the element — verify in the Task 4 build.)

- [ ] **Step 4: Type-check compiles** — Run: `pnpm build`
  Expected: build succeeds (the file isn't imported yet, but it must type-check). If `ItemInstance` generics differ from the installed types, adjust the `<T = unknown>` signatures to match.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml src/components/ui/tree.tsx
git commit -m "feat: add headless-tree deps and ui/tree primitive"
```

---

## Task 2: Page-tree data adapter (`pages-tree-data.ts`)

**Files:**
- Create: `src/components/generations/pages-tree-data.ts`
- Test: `src/components/generations/pages-tree-data.test.ts`

This is pure logic (no React) — fully unit-tested. It moves `ManifestPage` here and produces a flat id-keyed map for headless-tree.

- [ ] **Step 1: Write the failing test** — `pages-tree-data.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  buildPageTreeData,
  ancestorFolderIds,
  initialExpandedIds,
  ROOT_ID,
  type ManifestPage,
} from './pages-tree-data';

function page(path: string, status: ManifestPage['status'] = 'ok'): ManifestPage {
  return { url: `https://x.com/${path}`, path, filename: path.split('/').pop()!, status, blobPath: null };
}

describe('buildPageTreeData', () => {
  it('nests by path segments with a root, folders, and leaves', () => {
    const data = buildPageTreeData([page('index'), page('about'), page('services/branding'), page('services/strategy')]);
    expect(data[ROOT_ID].isFolder).toBe(true);
    // root children include the two top-level leaves and the services folder
    expect(data[ROOT_ID].childrenIds).toContain('index');
    expect(data[ROOT_ID].childrenIds).toContain('about');
    expect(data[ROOT_ID].childrenIds).toContain('services');
    expect(data['services'].isFolder).toBe(true);
    expect(data['services'].childrenIds).toEqual(['services/branding', 'services/strategy']);
    expect(data['services/branding'].isFolder).toBe(false);
    expect(data['services/branding'].page?.status).toBe('ok');
  });

  it('puts index first and leaves before folders, tallies folder ok/total', () => {
    const data = buildPageTreeData([
      page('services/branding'),
      page('about'),
      page('index'),
      page('services/down', 'failed'),
    ]);
    // index leaf precedes other leaves; leaves precede the services folder
    const top = data[ROOT_ID].childrenIds;
    expect(top.indexOf('index')).toBeLessThan(top.indexOf('about'));
    expect(top.indexOf('about')).toBeLessThan(top.indexOf('services'));
    expect(data['services'].total).toBe(2);
    expect(data['services'].okCount).toBe(1);
  });
});

describe('ancestorFolderIds', () => {
  it('returns the folder ids that contain a path', () => {
    expect(ancestorFolderIds('blog/2026/ai')).toEqual(['blog', 'blog/2026']);
    expect(ancestorFolderIds('about')).toEqual([]);
  });
});

describe('initialExpandedIds', () => {
  it('expands top-level folders plus the ancestors of the selected page', () => {
    const data = buildPageTreeData([page('a/b/c'), page('services/x'), page('index')]);
    const ids = initialExpandedIds(data, 'a/b/c');
    expect(ids).toContain('a');       // top-level folder
    expect(ids).toContain('services'); // top-level folder
    expect(ids).toContain('a/b');      // ancestor of selection
  });
});
```

- [ ] **Step 2: Run to verify failure** — Run: `pnpm test src/components/generations/pages-tree-data.test.ts`
  Expected: FAIL — module not found.

- [ ] **Step 3: Implement `pages-tree-data.ts`**:

```ts
export type ManifestPage = {
  url: string;
  path: string | null;
  filename: string | null;
  status: 'ok' | 'failed' | 'skipped';
  blobPath: string | null;
  reason?: string;
};

export type TreeItemData = {
  id: string;
  name: string;
  isFolder: boolean;
  childrenIds: string[];
  page?: ManifestPage; // leaves only
  okCount?: number;    // folders only
  total?: number;      // folders only
};

export const ROOT_ID = '__root__';

type FolderNode = { kind: 'folder'; id: string; name: string; children: TreeNode[]; okCount: number; total: number };
type LeafNode = { kind: 'leaf'; id: string; name: string; page: ManifestPage };
type TreeNode = FolderNode | LeafNode;

function isIndexName(name: string): boolean {
  const n = name.toLowerCase();
  return n === 'index' || n === 'index.md';
}

function buildNested(pages: ManifestPage[]): FolderNode {
  const root: FolderNode = { kind: 'folder', id: ROOT_ID, name: '', children: [], okCount: 0, total: 0 };
  const folderIndex = new Map<string, FolderNode>([['', root]]);

  for (const p of pages) {
    if (!p.path) continue;
    const segs = p.path.split('/');
    const leafName = p.filename ?? segs[segs.length - 1];
    let parent = root;
    const accum: string[] = [];
    for (let i = 0; i < segs.length - 1; i++) {
      accum.push(segs[i]);
      const key = accum.join('/');
      let folder = folderIndex.get(key);
      if (!folder) {
        folder = { kind: 'folder', id: key, name: segs[i], children: [], okCount: 0, total: 0 };
        folderIndex.set(key, folder);
        parent.children.push(folder);
      }
      parent = folder;
    }
    parent.children.push({ kind: 'leaf', id: p.path, name: leafName, page: p });
  }

  function tally(node: TreeNode): void {
    if (node.kind === 'leaf') return;
    for (const c of node.children) tally(c);
    node.total = node.children.reduce((n, c) => n + (c.kind === 'leaf' ? 1 : c.total), 0);
    node.okCount = node.children.reduce(
      (n, c) => n + (c.kind === 'leaf' ? (c.page.status === 'ok' ? 1 : 0) : c.okCount),
      0,
    );
  }
  tally(root);

  function sort(node: TreeNode): void {
    if (node.kind === 'leaf') return;
    node.children.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'leaf' ? -1 : 1;
      if (a.kind === 'leaf' && b.kind === 'leaf') {
        const ai = isIndexName(a.name);
        const bi = isIndexName(b.name);
        if (ai && !bi) return -1;
        if (!ai && bi) return 1;
      }
      return a.name.localeCompare(b.name);
    });
    node.children.forEach(sort);
  }
  sort(root);
  return root;
}

/** Flat id-keyed map consumed by headless-tree's syncDataLoaderFeature. */
export function buildPageTreeData(pages: ManifestPage[]): Record<string, TreeItemData> {
  const root = buildNested(pages);
  const map: Record<string, TreeItemData> = {};
  function walk(node: TreeNode): void {
    if (node.kind === 'leaf') {
      map[node.id] = { id: node.id, name: node.name, isFolder: false, childrenIds: [], page: node.page };
      return;
    }
    map[node.id] = {
      id: node.id,
      name: node.name,
      isFolder: true,
      childrenIds: node.children.map((c) => c.id),
      okCount: node.okCount,
      total: node.total,
    };
    node.children.forEach(walk);
  }
  walk(root);
  return map;
}

/** Folder ids that contain `path` (excluding the leaf itself). */
export function ancestorFolderIds(path: string): string[] {
  const segs = path.split('/');
  const out: string[] = [];
  const accum: string[] = [];
  for (let i = 0; i < segs.length - 1; i++) {
    accum.push(segs[i]);
    out.push(accum.join('/'));
  }
  return out;
}

/** Top-level folders + ancestors of the selected page, for headless-tree initialState. */
export function initialExpandedIds(
  data: Record<string, TreeItemData>,
  selectedPath: string | null,
): string[] {
  const topLevel = (data[ROOT_ID]?.childrenIds ?? []).filter((id) => data[id]?.isFolder);
  const ancestors = selectedPath ? ancestorFolderIds(selectedPath) : [];
  return Array.from(new Set([...topLevel, ...ancestors]));
}
```

- [ ] **Step 4: Run to verify pass** — Run: `pnpm test src/components/generations/pages-tree-data.test.ts`
  Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/generations/pages-tree-data.ts src/components/generations/pages-tree-data.test.ts
git commit -m "feat: pages-tree-data adapter for headless-tree"
```

---

## Task 3: URL-backed selection in `page-workspace-context.tsx`

**Files:**
- Modify: `src/components/generations/page-workspace-context.tsx`
- Test: `src/components/generations/page-workspace-context.test.tsx` (create)

The provider currently derives selection from local `manualSelected` state. Replace that with a `?page=` URL param read/write while keeping the same `Ctx` shape and the manifest query.

- [ ] **Step 1: Write the failing test** — `page-workspace-context.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PageWorkspaceProvider, usePageWorkspace } from './page-workspace-context';
import type { Generation } from '@/db/schema';

const replace = vi.fn();
let searchParams = new URLSearchParams('');
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/sites/uid-1',
  useSearchParams: () => searchParams,
}));

const gen = { id: 1, uid: 'g1', pagesStatus: 'succeeded' } as unknown as Generation;

function Probe() {
  const { selectedPath, setSelectedPath } = usePageWorkspace();
  return (
    <div>
      <span data-testid="sel">{selectedPath ?? 'none'}</span>
      <button onClick={() => setSelectedPath('services/branding')}>pick</button>
    </div>
  );
}

function renderWith(pagesPaths: string[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      new Response(
        JSON.stringify({
          status: 'succeeded',
          pages: pagesPaths.map((p) => ({ url: `https://x.com/${p}`, path: p, filename: p.split('/').pop(), status: 'ok', blobPath: null })),
        }),
        { status: 200 },
      ),
    ),
  );
  return render(
    <QueryClientProvider client={client}>
      <PageWorkspaceProvider generation={gen}>
        <Probe />
      </PageWorkspaceProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  replace.mockClear();
  searchParams = new URLSearchParams('');
});

describe('PageWorkspaceProvider URL backing', () => {
  it('selects the ?page= value when it is a known page', async () => {
    searchParams = new URLSearchParams('page=services%2Fbranding');
    renderWith(['index', 'services/branding']);
    expect(await screen.findByText('services/branding')).toBeInTheDocument();
  });

  it('falls back to index when ?page= is missing or unknown', async () => {
    searchParams = new URLSearchParams('page=does-not-exist');
    renderWith(['index', 'about']);
    expect(await screen.findByText('index')).toBeInTheDocument();
  });

  it('writes the encoded page to the URL on selection', async () => {
    renderWith(['index', 'services/branding']);
    await screen.findByText('index');
    fireEvent.click(screen.getByText('pick'));
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace.mock.calls[0][0]).toContain('page=services%2Fbranding');
    expect(replace.mock.calls[0][1]).toEqual({ scroll: false });
  });
});
```

- [ ] **Step 2: Run to verify failure** — Run: `pnpm test src/components/generations/page-workspace-context.test.tsx`
  Expected: FAIL — selection isn't URL-backed yet (writes won't call `replace`).

- [ ] **Step 3: Implement** — replace the body of `page-workspace-context.tsx`:

```tsx
'use client';
import { createContext, useCallback, useContext, useMemo } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { Generation } from '@/db/schema';
import type { ManifestPage } from './pages-tree-data';

type ManifestResponse =
  | { status: 'pending' | 'running'; pages: [] }
  | { status: 'succeeded' | 'cancelled'; pages: ManifestPage[]; successCount?: number; failedCount?: number; totalUrls?: number }
  | { status: 'skipped' | 'failed'; reason?: string; pages: [] };

type Ctx = {
  generation: Generation | null;
  pages: ManifestPage[];
  manifestPending: boolean;
  selectedPath: string | null;
  setSelectedPath: (path: string) => void;
};

const PageWorkspaceContext = createContext<Ctx | null>(null);
const PAGE_PARAM = 'page';

export function PageWorkspaceProvider({
  generation,
  children,
}: {
  generation: Generation | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const q = useQuery({
    queryKey: ['pagesManifest', generation?.id, generation?.pagesStatus],
    enabled:
      !!generation &&
      (generation.pagesStatus === 'succeeded' || generation.pagesStatus === 'cancelled'),
    queryFn: async (): Promise<ManifestResponse> => {
      const res = await fetch(`/api/generations/${generation!.uid}/pages`);
      if (!res.ok) throw new Error(`status ${res.status}`);
      return res.json() as Promise<ManifestResponse>;
    },
    staleTime: 30_000,
  });

  const manifest = q.data && 'pages' in q.data ? q.data : null;
  const pages = useMemo(() => (manifest?.pages ?? []) as ManifestPage[], [manifest?.pages]);

  const urlPage = searchParams.get(PAGE_PARAM);

  // Effective selection: a valid ?page= wins; else index; else first page.
  const selectedPath = useMemo(() => {
    if (urlPage && pages.some((p) => p.path === urlPage)) return urlPage;
    if (pages.some((p) => p.path === 'index')) return 'index';
    return pages[0]?.path ?? null;
  }, [urlPage, pages]);

  const setSelectedPath = useCallback(
    (path: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set(PAGE_PARAM, path); // URLSearchParams encodes on toString()
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const value = useMemo<Ctx>(
    () => ({ generation, pages, manifestPending: q.isPending, selectedPath, setSelectedPath }),
    [generation, pages, q.isPending, selectedPath, setSelectedPath],
  );

  return <PageWorkspaceContext.Provider value={value}>{children}</PageWorkspaceContext.Provider>;
}

export function usePageWorkspace(): Ctx {
  const ctx = useContext(PageWorkspaceContext);
  if (!ctx) throw new Error('usePageWorkspace must be used within PageWorkspaceProvider');
  return ctx;
}
```

- [ ] **Step 4: Run to verify pass** — Run: `pnpm test src/components/generations/page-workspace-context.test.tsx`
  Expected: PASS. (`URLSearchParams.set('page','services/branding').toString()` yields `page=services%2Fbranding`.)

- [ ] **Step 5: Commit**

```bash
git add src/components/generations/page-workspace-context.tsx src/components/generations/page-workspace-context.test.tsx
git commit -m "feat: URL-back the selected page (?page=) in PageWorkspaceProvider"
```

---

## Task 4: `PagesRail` component

**Files:**
- Create: `src/components/generations/pages-rail.tsx`
- Test: `src/components/generations/pages-rail.test.tsx`

Renders the headless-tree tree from context, with a filter input, loading/empty states, status dots, and folder counts. Selecting a leaf calls `setSelectedPath`.

- [ ] **Step 1: Write the failing test** — `pages-rail.test.tsx` (mock the context so the test doesn't depend on the provider/network):

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PagesRail } from './pages-rail';
import type { ManifestPage } from './pages-tree-data';

const setSelectedPath = vi.fn();
let ctx: {
  pages: ManifestPage[];
  manifestPending: boolean;
  selectedPath: string | null;
  setSelectedPath: (p: string) => void;
};
vi.mock('./page-workspace-context', () => ({
  usePageWorkspace: () => ctx,
}));

function page(path: string, status: ManifestPage['status'] = 'ok'): ManifestPage {
  return { url: `https://x.com/${path}`, path, filename: path.split('/').pop()!, status, blobPath: null };
}

function setCtx(over: Partial<typeof ctx>) {
  ctx = { pages: [], manifestPending: false, selectedPath: null, setSelectedPath, ...over };
}

describe('PagesRail', () => {
  it('shows a loading state while the manifest is pending', () => {
    setCtx({ manifestPending: true });
    render(<PagesRail />);
    expect(screen.getByText(/loading pages/i)).toBeInTheDocument();
  });

  it('shows an empty hint when there are no pages', () => {
    setCtx({ pages: [] });
    render(<PagesRail />);
    expect(screen.getByText(/no pages yet/i)).toBeInTheDocument();
  });

  it('renders page names and selecting a page calls setSelectedPath', () => {
    setCtx({ pages: [page('index'), page('about')], selectedPath: 'index' });
    render(<PagesRail />);
    const about = screen.getByText('about');
    fireEvent.click(about);
    expect(setSelectedPath).toHaveBeenCalledWith('about');
  });
});
```

- [ ] **Step 2: Run to verify failure** — Run: `pnpm test src/components/generations/pages-rail.test.tsx`
  Expected: FAIL — module not found.

- [ ] **Step 3: Implement `pages-rail.tsx`**:

```tsx
'use client';

import { useMemo, useState } from 'react';
import {
  syncDataLoaderFeature,
  selectionFeature,
  hotkeysCoreFeature,
  searchFeature,
} from '@headless-tree/core';
import { useTree } from '@headless-tree/react';
import { FileText, Search } from 'lucide-react';
import { Tree, TreeItem, TreeItemLabel } from '@/components/ui/tree';
import { usePageWorkspace } from './page-workspace-context';
import {
  buildPageTreeData,
  initialExpandedIds,
  ROOT_ID,
  type TreeItemData,
} from './pages-tree-data';

const INDENT = 16;

function StatusDot({ status }: { status: 'ok' | 'failed' | 'skipped' }) {
  const cls =
    status === 'ok' ? 'bg-semantic-success' : status === 'failed' ? 'bg-destructive' : 'bg-hairline-strong';
  return <span aria-label={status} className={`inline-block h-2 w-2 shrink-0 rounded-full ${cls}`} />;
}

export function PagesRail() {
  const { pages, manifestPending, selectedPath, setSelectedPath } = usePageWorkspace();
  const data = useMemo(() => buildPageTreeData(pages), [pages]);
  const expanded = useMemo(() => initialExpandedIds(data, selectedPath), [data, selectedPath]);

  // Remount the tree when the page set changes so the data loader re-reads.
  const treeKey = useMemo(() => Object.keys(data).join('|'), [data]);

  return (
    <aside className="sticky top-4 rounded-2xl border border-hairline bg-surface-card p-3 shadow-[0_8px_30px_rgba(0,0,0,0.05)]">
      <div className="flex items-center justify-between px-2 pb-2">
        <span className="caption-uppercase text-muted-strong">Pages</span>
        <span className="text-xs text-muted-soft">{pages.length}</span>
      </div>
      {manifestPending ? (
        <p className="px-2 py-6 text-sm text-muted-strong">Loading pages…</p>
      ) : pages.length === 0 ? (
        <p className="px-2 py-6 text-sm text-muted-strong">No pages yet — run a generation to list pages.</p>
      ) : (
        <RailTree
          key={treeKey}
          data={data}
          expanded={expanded}
          selectedPath={selectedPath}
          onSelect={setSelectedPath}
        />
      )}
    </aside>
  );
}

function RailTree({
  data,
  expanded,
  selectedPath,
  onSelect,
}: {
  data: Record<string, TreeItemData>;
  expanded: string[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
}) {
  const [search, setSearch] = useState('');

  const tree = useTree<TreeItemData>({
    rootItemId: ROOT_ID,
    getItemName: (item) => item.getItemData().name,
    isItemFolder: (item) => item.getItemData().isFolder,
    dataLoader: {
      getItem: (id) => data[id],
      getChildren: (id) => data[id]?.childrenIds ?? [],
    },
    indent: INDENT,
    initialState: {
      expandedItems: expanded,
      selectedItems: selectedPath ? [selectedPath] : [],
    },
    onPrimaryAction: (item) => {
      if (item.isFolder()) {
        if (item.isExpanded()) item.collapse();
        else item.expand();
      } else {
        onSelect(item.getId());
      }
    },
    features: [syncDataLoaderFeature, selectionFeature, hotkeysCoreFeature, searchFeature],
  });

  return (
    <div>
      <div className="mb-2 flex items-center gap-2 rounded-lg border border-hairline bg-canvas-soft px-2.5">
        <Search className="h-3.5 w-3.5 text-muted-soft" aria-hidden />
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            if (e.target.value) tree.setSearch?.(e.target.value);
          }}
          placeholder="Filter pages…"
          aria-label="Filter pages"
          className="h-8 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted-soft"
        />
      </div>
      <Tree tree={tree} indent={INDENT} className="max-h-[60vh] overflow-auto">
        {tree.getItems().map((item) => {
          const d = item.getItemData();
          return (
            <TreeItem key={item.getId()} item={item}>
              <TreeItemLabel>
                {item.isFolder() ? (
                  <>
                    <span className="truncate">{d.name}</span>
                    <span className="ml-auto shrink-0 text-xs text-muted-strong">
                      ({d.okCount}/{d.total})
                    </span>
                  </>
                ) : (
                  <>
                    <FileText className="size-4 text-muted-soft" aria-hidden />
                    {d.page && <StatusDot status={d.page.status} />}
                    <span className="truncate">{d.name}</span>
                  </>
                )}
              </TreeItemLabel>
            </TreeItem>
          );
        })}
      </Tree>
    </div>
  );
}
```

- [ ] **Step 4: Run to verify pass** — Run: `pnpm test src/components/generations/pages-rail.test.tsx`
  Expected: PASS. If clicking the leaf does not fire `onPrimaryAction` in jsdom (headless-tree wires click through `item.getProps()`), the test still works because the click lands on the `<button>` from `TreeItem`; verify the selection path. If headless-tree's `setSearch` method name differs (per the Task 1 `.d.ts` check — it may be `tree.openSearch()` + `getSearchInputElementProps()`), wire the input through the documented search API instead and keep the filtering behavior. Adjust and re-run.

- [ ] **Step 5: Build** — Run: `pnpm build`
  Expected: succeeds. Fix any Tailwind `in-data-[...]` variant issues surfaced here (fall back to `data-[selected=true]:` on the label element if needed).

- [ ] **Step 6: Commit**

```bash
git add src/components/generations/pages-rail.tsx src/components/generations/pages-rail.test.tsx
git commit -m "feat: PagesRail with headless-tree, filter, status dots, counts"
```

---

## Task 5: Lay out the rail in `site-detail-client.tsx`

**Files:**
- Modify: `src/app/(app)/sites/[id]/site-detail-client.tsx`

Lift the provider to wrap a two-column grid: the existing folder block on the left, `PagesRail` on the right.

- [ ] **Step 1: Add the import** near the other generation imports:

```tsx
import { PagesRail } from '@/components/generations/pages-rail';
```

- [ ] **Step 2: Restructure the layout.** The provider currently wraps only the content panel area (the `<PageWorkspaceProvider generation={selected}>` around the `TabsContent`s). Move it up to wrap the whole gooey-folder block + the rail in a grid. Replace the block that starts at `{/* The Gooey Folder Container */}` `<div className="relative w-full">` … through its closing `</div>` (the `PageWorkspaceProvider` currently inside it moves out) with:

```tsx
      <PageWorkspaceProvider generation={selected}>
        <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-[minmax(0,1fr)_320px]">
          {/* The Gooey Folder Container */}
          <div className="relative w-full min-w-0">
            <GooeyFilter id="folder-gooey-filter" strength={screenSize.lessThan('md') ? 8 : 15} />

            {/* Layer 1: Visual backgrounds */}
            <div className="absolute -top-8 bottom-0 left-0 right-0 pointer-events-none filter drop-shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:drop-shadow-[0_8px_30px_rgba(0,0,0,0.2)]">
              <div className="w-full h-full" style={{ filter: 'url(#folder-gooey-filter)' }}>
                <div className="flex w-full h-[96px] pt-[56px]">
                  {tabItems.map((item, idx) => (
                    <div key={item.value} className="relative flex-1 h-full">
                      {activeTab === item.value && (
                        <m.div
                          layoutId="active-folder-tab-bg"
                          className={cn(
                            'absolute inset-y-0 bg-surface-card dark:bg-zinc-900',
                            idx === 0 ? 'left-0 right-2 rounded-tr-2xl rounded-tl-none' :
                            idx === tabItems.length - 1 ? 'left-2 right-0 rounded-tl-2xl rounded-tr-none' :
                            'left-2 right-2 rounded-t-2xl',
                          )}
                          transition={{ type: 'spring', bounce: 0.0, duration: 0.4 }}
                        />
                      )}
                    </div>
                  ))}
                </div>
                <div
                  className={cn(
                    'w-full bg-surface-card dark:bg-zinc-900 rounded-b-2xl h-[calc(100%-96px)]',
                    activeTab === tabItems[0].value ? 'rounded-tl-none' : 'rounded-tl-2xl',
                    activeTab === tabItems[tabItems.length - 1].value ? 'rounded-tr-none' : 'rounded-tr-2xl',
                  )}
                />
              </div>
            </div>

            {/* Layer 2: Interactive controls & content panels */}
            <div className="relative z-10 flex flex-col">
              <TabsList className="bg-transparent border-transparent p-0 flex w-full h-16! pt-6! group-data-[orientation=horizontal]/tabs:h-16 group-data-[orientation=horizontal]/tabs:pt-6">
                {tabItems.map((item) => (
                  <Fragment key={item.value}>
                    {item.isSetup && <span aria-hidden className="self-center mx-1 h-5 w-px bg-hairline-strong" />}
                    <TabsTrigger
                      value={item.value}
                      className={cn(
                        'flex-1 h-10 flex items-center justify-center transition-colors duration-200 outline-none',
                        'data-[state=active]:bg-transparent! data-[state=active]:shadow-none! data-[state=active]:border-transparent! dark:data-[state=active]:bg-transparent! dark:data-[state=active]:border-transparent!',
                        activeTab === item.value ? 'text-ink font-semibold' : 'text-muted-foreground hover:text-ink',
                        item.isSetup && 'opacity-70',
                      )}
                    >
                      {item.label}
                    </TabsTrigger>
                  </Fragment>
                ))}
              </TabsList>

              <div className="p-4 md:p-6 min-w-0 min-h-[600px]">
                <TabsContent value="overview" className="mt-0 outline-none">
                  <OverviewPanel siteId={site.uid} onNavigate={setActiveTab} />
                </TabsContent>
                <TabsContent value="readable" className="mt-0 outline-none">
                  <ReadablePanel siteId={site.uid} />
                </TabsContent>
                <TabsContent value="recommendable" className="mt-0 outline-none">
                  <RecommendablePanel siteId={site.uid} />
                </TabsContent>
                <TabsContent value="recognized" className="mt-0 outline-none">
                  <RecognizedPanel siteId={site.uid} />
                </TabsContent>
                <TabsContent value="setup" className="mt-0 outline-none">
                  <SetupPanel generation={selected} siteId={site.uid} />
                </TabsContent>
              </div>
            </div>
          </div>

          {/* Right rail */}
          <PagesRail />
        </div>
      </PageWorkspaceProvider>
```

(The `PageWorkspaceProvider` no longer wraps only the content `div`; it now wraps the grid. Remove the old inner `<PageWorkspaceProvider generation={selected}>…</PageWorkspaceProvider>` wrapper around the `TabsContent`s — those `TabsContent`s now live directly in the content `div` shown above.)

- [ ] **Step 2b: Verify the provider isn't double-mounted.** Grep to confirm exactly one `PageWorkspaceProvider` usage remains in the file:

Run: `grep -c "PageWorkspaceProvider" "src/app/(app)/sites/[id]/site-detail-client.tsx"`
Expected: `2` (the import + one usage). If `3`, you left the old inner wrapper in — remove it.

- [ ] **Step 3: Build + manual check** — Run: `pnpm build`
  Expected: succeeds. Then `pnpm dev` and open a site detail page via the preview workflow: the rail shows on the right on every tab; the gooey folder tabs still render cleanly in the narrower column.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/sites/[id]/site-detail-client.tsx"
git commit -m "feat: render PagesRail in a two-column site-detail layout"
```

---

## Task 6: Drop the inline tree from Readable & Recognized panels

**Files:**
- Modify: `src/components/generations/readable-panel.tsx`
- Modify: `src/components/generations/recognized-panel.tsx`
- Modify: `src/components/generations/readable-panel.test.tsx`
- Modify: `src/components/generations/recognized-panel.test.tsx`

Both panels render `<PagesTree>` in a `[280px 1fr]` grid. Remove the tree column; the detail spans the full width. They keep `usePageWorkspace()` for `selectedPath`/`selectedPage`.

- [ ] **Step 1: Update the tests first** — in `readable-panel.test.tsx` and `recognized-panel.test.tsx`, find any assertion that the panel renders a page tree / page-name buttons sourced from the manifest and replace/remove it (the tree now lives in `PagesRail`). Run them to see which assertions reference the tree:

Run: `pnpm test src/components/generations/readable-panel.test.tsx src/components/generations/recognized-panel.test.tsx`
Note any failures tied to the tree after Step 2; if a test only existed to assert the inline tree, delete that test case. Keep tests that assert the detail view (menubar, markdown, citation audit).

- [ ] **Step 2: Edit `readable-panel.tsx`.** Remove the `PagesTree` import (`import { PagesTree } from './pages-tree';`). Replace the two-column content block (the `<div className="grid grid-cols-1 items-start gap-6 md:grid-cols-[280px_1fr]">` … containing the sticky tree column … and the `<div className="min-w-0">` detail column) so only the detail column remains:

```tsx
      <div className="min-w-0">
        {selectedPath && selectedPage ? (
          // ...existing detail JSX unchanged (menubar + content)...
        ) : (
          // ...existing "no page selected" fallback unchanged...
        )}
      </div>
```

Also simplify the `meta` prop grid: change `md:grid-cols-[280px_1fr]` to a simple flex/row (drop the 280px tree-aligned column) — e.g. `<div className="flex flex-wrap items-center gap-x-6 gap-y-1">`. Keep the summary + selected-page filename indicator.

The `manifestPending` guard that only gated the tree is no longer needed in the panel (the rail owns loading). Keep any `manifestPending` usage that gates the detail; remove the tree-only branch.

- [ ] **Step 3: Edit `recognized-panel.tsx`** — identical changes (remove `PagesTree` import, collapse the `[280px 1fr]` grid to the detail column, simplify the `meta` grid).

- [ ] **Step 4: Run the panel tests** — Run: `pnpm test src/components/generations/readable-panel.test.tsx src/components/generations/recognized-panel.test.tsx`
  Expected: PASS (after removing tree-only assertions in Step 1).

- [ ] **Step 5: Commit**

```bash
git add src/components/generations/readable-panel.tsx src/components/generations/recognized-panel.tsx src/components/generations/readable-panel.test.tsx src/components/generations/recognized-panel.test.tsx
git commit -m "refactor: drop inline PagesTree from Readable/Recognized panels"
```

---

## Task 7: Retire old `PagesTree` + full verification

**Files:**
- Delete: `src/components/generations/pages-tree.tsx`, `src/components/generations/pages-tree.test.tsx`

- [ ] **Step 1: Confirm no remaining importers of `PagesTree` or the old module**

Run: `grep -rn "from './pages-tree'\|from '@/components/generations/pages-tree'\|PagesTree" src | grep -v pages-tree-data | grep -v pages-rail`
Expected: no matches (Task 6 removed the panel imports; Task 3 repointed `ManifestPage` to `pages-tree-data`). If `page-workspace-context.tsx` still imports `ManifestPage from './pages-tree'`, it was already changed in Task 3 — verify it reads `./pages-tree-data`. If any other file imports from `./pages-tree`, repoint it to `./pages-tree-data` before deleting.

- [ ] **Step 2: Delete the files**

```bash
git rm src/components/generations/pages-tree.tsx src/components/generations/pages-tree.test.tsx
```

- [ ] **Step 3: Full verification** — Run: `pnpm test && pnpm build && pnpm lint`
  Expected: all tests pass, build succeeds, lint reports no NEW errors (pre-existing repo lint errors unchanged). Confirm the new files (`ui/tree.tsx`, `pages-tree-data.ts`, `pages-rail.tsx`, `page-workspace-context.tsx`) are lint-clean:
  Run: `npx eslint src/components/ui/tree.tsx src/components/generations/pages-tree-data.ts src/components/generations/pages-rail.tsx src/components/generations/page-workspace-context.tsx`
  Expected: clean.

- [ ] **Step 4: Manual smoke (preview)** — `pnpm dev`, open a site detail page with a succeeded generation:
  - Rail on the right shows the page tree with status dots + folder counts, on every tab.
  - Filtering narrows the list.
  - Clicking a page updates the Readable/Recognized detail and puts `?page=<path>` in the URL.
  - Refresh → same page stays selected.
  - Readable/Recognized no longer show their own tree; detail spans full width.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: remove legacy PagesTree (superseded by PagesRail)"
```

---

## Self-Review Notes (author)

- **Spec coverage:** rail always-visible + floating card (T4/T5); headless-tree primitive (T1/T4); status dots + folder counts (T4); filter (T4); URL-backed `?page=` (T3); desktop two-column, stack below md (T5); Readable/Recognized drop inline tree (T6); retire PagesTree, keep logic in pages-tree-data (T2/T7); tests for adapter, provider URL, rail (T2/T3/T4). All §-sections mapped.
- **Type consistency:** `ManifestPage` defined once in `pages-tree-data.ts` (T2), imported by the provider (T3) and rail (T4). `TreeItemData`, `ROOT_ID`, `buildPageTreeData`, `ancestorFolderIds`, `initialExpandedIds` defined in T2 and used verbatim in T4. `Ctx` shape (`pages/manifestPending/selectedPath/setSelectedPath`) unchanged between T3 and T4's mock.
- **External-API risk:** headless-tree call surface (`useTree`, features, `onPrimaryAction`, item methods, search) is targeted at the documented API; T1 Step 2 and T4 Steps 4–5 require verifying against the installed `.d.ts` and the build, adjusting names if the version differs while keeping the structure. The `StatusDot` prop type in T4 uses a convoluted conditional — simplify to `status: 'ok' | 'failed' | 'skipped'` if the inferred type is awkward.
```
