'use client';

import { useMemo, useState } from 'react';

export type ManifestPage = {
  url: string;
  path: string | null;
  filename: string | null;
  status: 'ok' | 'failed' | 'skipped';
  blobPath: string | null;
  reason?: string;
};

type FolderNode = {
  kind: 'folder';
  name: string;
  children: TreeNode[];
  okCount: number;
  total: number;
};
type LeafNode = {
  kind: 'leaf';
  name: string;
  page: ManifestPage;
};
type TreeNode = FolderNode | LeafNode;

function buildTree(pages: ManifestPage[]): TreeNode[] {
  const root: FolderNode = { kind: 'folder', name: '', children: [], okCount: 0, total: 0 };
  const folderIndex = new Map<string, FolderNode>([['', root]]);

  for (const page of pages) {
    if (!page.path) continue;
    const segs = page.path.split('/');
    const leafName = page.filename ?? segs[segs.length - 1];
    let parent = root;
    const accum: string[] = [];
    for (let i = 0; i < segs.length - 1; i++) {
      accum.push(segs[i]);
      const key = accum.join('/');
      let folder = folderIndex.get(key);
      if (!folder) {
        folder = { kind: 'folder', name: segs[i], children: [], okCount: 0, total: 0 };
        folderIndex.set(key, folder);
        parent.children.push(folder);
      }
      parent = folder;
    }
    parent.children.push({ kind: 'leaf', name: leafName, page });
  }

  function tally(node: TreeNode): void {
    if (node.kind === 'leaf') return;
    for (const c of node.children) tally(c);
    node.total = node.children.reduce(
      (n, c) => n + (c.kind === 'leaf' ? 1 : c.total),
      0,
    );
    node.okCount = node.children.reduce(
      (n, c) =>
        n + (c.kind === 'leaf' ? (c.page.status === 'ok' ? 1 : 0) : c.okCount),
      0,
    );
  }
  tally(root);

  root.children.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return root.children;
}

function StatusDot({ status }: { status: ManifestPage['status'] }) {
  const colorClass =
    status === 'ok'
      ? 'bg-timeline-done'
      : status === 'failed'
        ? 'bg-timeline-edit'
        : 'bg-hairline-strong';
  return (
    <span
      aria-label={status}
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${colorClass}`}
    />
  );
}

function Branch({
  node,
  depth,
  selectedPath,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}) {
  const [open, setOpen] = useState(depth < 2);

  if (node.kind === 'leaf') {
    const isSelected = node.page.path === selectedPath;
    return (
      <button
        type="button"
        onClick={() => {
          if (node.page.path) onSelect(node.page.path);
        }}
        className={`flex w-full items-center gap-2 px-2 py-1 text-left text-sm transition-colors ${
          isSelected
            ? 'bg-canvas-soft text-ink'
            : 'text-body hover:bg-canvas-soft'
        } ${node.page.status !== 'ok' ? 'opacity-70' : ''}`}
        style={{ paddingLeft: 8 + depth * 12 }}
      >
        <StatusDot status={node.page.status} />
        <span className="truncate">{node.name}</span>
      </button>
    );
  }

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-2 py-1 text-left text-sm text-ink hover:bg-canvas-soft transition-colors"
        style={{ paddingLeft: 8 + depth * 12 }}
      >
        <span className="shrink-0 text-xs">{open ? '▾' : '▸'}</span>
        <span>{node.name}</span>
        <span className="ml-auto shrink-0 text-xs text-body">
          ({node.okCount}/{node.total})
        </span>
      </button>
      {open &&
        node.children.map((child, i) => (
          <Branch
            key={i}
            node={child}
            depth={depth + 1}
            selectedPath={selectedPath}
            onSelect={onSelect}
          />
        ))}
    </div>
  );
}

export function PagesTree({
  pages,
  selectedPath,
  onSelect,
}: {
  pages: ManifestPage[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
}) {
  const tree = useMemo(() => buildTree(pages), [pages]);
  return (
    <div className="overflow-auto">
      {tree.map((node, i) => (
        <Branch
          key={i}
          node={node}
          depth={0}
          selectedPath={selectedPath}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
