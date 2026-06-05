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
    status === 'ok'
      ? 'bg-semantic-success'
      : status === 'failed'
        ? 'bg-destructive'
        : 'bg-hairline-strong';
  return <span aria-label={status} className={`inline-block h-2 w-2 shrink-0 rounded-full ${cls}`} />;
}

export function PagesRail() {
  const { pages, manifestPending, selectedPath, setSelectedPath } = usePageWorkspace();
  const data = useMemo(() => buildPageTreeData(pages), [pages]);
  const expanded = useMemo(() => initialExpandedIds(data, selectedPath), [data, selectedPath]);
  const treeKey = useMemo(() => Object.keys(data).join('|'), [data]);

  return (
    // Top padding aligns the card top with the content tabs card (symmetry).
    // (main pt-4 = 16 + the one-row header ≈ 53 + the gap-5 = 20 ≈ 89)
    <div className="flex h-full flex-col pb-4 pl-1 pr-4 pt-[89px]">
      <aside className="flex min-h-0 flex-1 flex-col rounded-2xl border border-hairline bg-surface-card p-4 shadow-[0_8px_30px_rgba(0,0,0,0.05)]">
        <div className="flex shrink-0 items-center justify-between px-1 pb-3">
          <span className="caption-uppercase text-muted-strong">Pages</span>
          <span className="text-xs text-muted-strong">{pages.length}</span>
        </div>
      {manifestPending ? (
        <p className="px-2 py-6 text-sm text-muted-strong">Loading pages…</p>
      ) : pages.length === 0 ? (
        <p className="px-2 py-6 text-sm text-muted-strong">
          No pages yet — run a generation to list pages.
        </p>
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
    </div>
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
    // expanded + selectedPath seed initialState only (consumed at mount). URL back/forward
    // won't move the highlight without a remount, which we intentionally avoid (keeps scroll).
    initialState: {
      expandedItems: expanded,
      selectedItems: selectedPath ? [selectedPath] : [],
    },
    onPrimaryAction: (item) => {
      // Folders: headless-tree's own onClick already toggles expand/collapse. Toggling
      // here too would double-toggle and the folder would never change state. Only
      // handle leaf selection.
      if (!item.isFolder()) onSelect(item.getId());
    },
    features: [syncDataLoaderFeature, selectionFeature, hotkeysCoreFeature, searchFeature],
  });

  // Local filter: headless-tree's getItems() only includes items in expanded
  // folders, so a tree-based filter would miss pages in collapsed/nested folders.
  // When the box is non-empty, build a flat list of matching leaves from the full
  // data map instead; when empty, render the tree as usual.
  const q = search.trim().toLowerCase();
  const matches = q
    ? Object.values(data).filter((d) => !d.isFolder && d.name.toLowerCase().includes(q))
    : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-2 flex shrink-0 items-center gap-2 rounded-lg border border-hairline bg-canvas-soft px-2.5">
        <Search className="h-3.5 w-3.5 text-muted-strong" aria-hidden />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter pages…"
          aria-label="Filter pages"
          className="h-8 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted-strong"
        />
      </div>
      {matches ? (
        matches.length === 0 ? (
          <p className="px-2 py-6 text-sm text-muted-strong">No pages match.</p>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-auto">
            {matches.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => onSelect(d.id)}
                className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm text-body hover:bg-canvas-soft"
              >
                <FileText className="size-4 text-muted-strong" aria-hidden />
                {d.page && <StatusDot status={d.page.status} />}
                <span className="truncate">{d.name}</span>
              </button>
            ))}
          </div>
        )
      ) : (
        <Tree tree={tree} indent={INDENT} className="min-h-0 flex-1 overflow-auto">
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
                      <FileText className="size-4 text-muted-strong" aria-hidden />
                      {d.page && <StatusDot status={d.page.status} />}
                      <span className="truncate">{d.name}</span>
                    </>
                  )}
                </TreeItemLabel>
              </TreeItem>
            );
          })}
        </Tree>
      )}
    </div>
  );
}
