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
    <aside className="sticky top-4 rounded-2xl border border-hairline bg-surface-card p-3 shadow-[0_8px_30px_rgba(0,0,0,0.05)]">
      <div className="flex items-center justify-between px-2 pb-2">
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

  // Wire search: tree.setSearch drives headless-tree's searchFeature so
  // tree.getItems() automatically returns only matching items when active.
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearch(value);
    tree.setSearch(value.length > 0 ? value : null);
  };

  return (
    <div>
      <div className="mb-2 flex items-center gap-2 rounded-lg border border-hairline bg-canvas-soft px-2.5">
        <Search className="h-3.5 w-3.5 text-muted-strong" aria-hidden />
        <input
          value={search}
          onChange={handleSearchChange}
          placeholder="Filter pages…"
          aria-label="Filter pages"
          className="h-8 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted-strong"
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
    </div>
  );
}
