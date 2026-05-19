'use client';

import { useMemo, useState } from 'react';
import { CitationsTierPill } from './citations-tier-pill';
import { formatRelativeTime } from '@/lib/format-time';
import { cn } from '@/lib/utils';

export type CitationsPageRow = {
  pageUrl: string;
  score: number | null;
  tier: 'poor' | 'fair' | 'good' | 'excellent' | null;
  fetchedAt: string | null;
};

type FolderNode = {
  kind: 'folder';
  name: string;
  path: string;
  children: TreeNode[];
  total: number;
  auditedCount: number;
};
type LeafNode = {
  kind: 'leaf';
  name: string;
  row: CitationsPageRow;
};
type TreeNode = FolderNode | LeafNode;

function segmentsFor(pageUrl: string): string[] {
  try {
    return new URL(pageUrl).pathname.split('/').filter(Boolean);
  } catch {
    return [];
  }
}

function buildTree(rows: CitationsPageRow[]): TreeNode[] {
  // Collect every path key that has at least one descendant URL — those are
  // "folder" keys. A URL is also a folder iff its own key appears in this set.
  const folderKeys = new Set<string>();
  for (const row of rows) {
    const segs = segmentsFor(row.pageUrl);
    for (let i = 0; i < segs.length - 1; i++) {
      folderKeys.add(segs.slice(0, i + 1).join('/'));
    }
  }

  const root: FolderNode = {
    kind: 'folder',
    name: '',
    path: '',
    children: [],
    total: 0,
    auditedCount: 0,
  };
  const folderIndex = new Map<string, FolderNode>([['', root]]);

  function ensureFolder(segs: string[]): FolderNode {
    let parent = root;
    const accum: string[] = [];
    for (const seg of segs) {
      accum.push(seg);
      const key = accum.join('/');
      let folder = folderIndex.get(key);
      if (!folder) {
        folder = {
          kind: 'folder',
          name: seg,
          path: key,
          children: [],
          total: 0,
          auditedCount: 0,
        };
        folderIndex.set(key, folder);
        parent.children.push(folder);
      }
      parent = folder;
    }
    return parent;
  }

  for (const row of rows) {
    const segs = segmentsFor(row.pageUrl);
    const fullKey = segs.join('/');
    if (segs.length > 0 && folderKeys.has(fullKey)) {
      // /foo is both a page and a folder — nest it inside as the index entry.
      const folder = ensureFolder(segs);
      folder.children.unshift({ kind: 'leaf', name: '(index)', row });
      continue;
    }
    const parent = ensureFolder(segs.slice(0, -1));
    const leafName = segs.length === 0 ? '/' : segs[segs.length - 1];
    parent.children.push({ kind: 'leaf', name: leafName, row });
  }

  function tally(node: TreeNode): void {
    if (node.kind === 'leaf') return;
    for (const c of node.children) tally(c);
    node.total = node.children.reduce((n, c) => n + (c.kind === 'leaf' ? 1 : c.total), 0);
    node.auditedCount = node.children.reduce(
      (n, c) =>
        n + (c.kind === 'leaf' ? (c.row.fetchedAt ? 1 : 0) : c.auditedCount),
      0,
    );
  }
  tally(root);

  function sort(node: FolderNode): void {
    node.children.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'leaf' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const c of node.children) if (c.kind === 'folder') sort(c);
  }
  sort(root);

  return root.children;
}

function Branch({
  node,
  depth,
  selectedUrl,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  selectedUrl: string | null;
  onSelect: (pageUrl: string) => void;
}) {
  const [open, setOpen] = useState(false);

  if (node.kind === 'leaf') {
    const { row } = node;
    const isSelected = row.pageUrl === selectedUrl;
    return (
      <button
        type="button"
        onClick={() => onSelect(row.pageUrl)}
        className={cn(
          'flex w-full items-center gap-3 px-2 py-2 text-left text-sm transition-colors hover:bg-canvas-soft',
          isSelected && 'bg-canvas-soft text-ink',
        )}
        style={{ paddingLeft: 8 + depth * 14 }}
      >
        <span className="truncate flex-1 min-w-0 text-body">{node.name}</span>
        <span className="font-mono text-xs text-body tabular-nums w-8 text-right">
          {row.score ?? '—'}
        </span>
        <CitationsTierPill tier={row.tier ?? 'none'} />
        <span className="text-xs text-body w-20 text-right">
          {row.fetchedAt ? formatRelativeTime(row.fetchedAt) : 'Never'}
        </span>
      </button>
    );
  }

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-2 py-2 text-left text-sm text-ink hover:bg-canvas-soft transition-colors"
        style={{ paddingLeft: 8 + depth * 14 }}
      >
        <span className="shrink-0 text-xs">{open ? '▾' : '▸'}</span>
        <span className="font-medium truncate">{node.name}</span>
        <span className="ml-auto shrink-0 text-xs text-body">
          {node.auditedCount}/{node.total}
        </span>
      </button>
      {open &&
        node.children.map((child, i) => (
          <Branch
            key={i}
            node={child}
            depth={depth + 1}
            selectedUrl={selectedUrl}
            onSelect={onSelect}
          />
        ))}
    </div>
  );
}

export function CitationsPageTree({
  rows,
  selectedUrl,
  onSelect,
}: {
  rows: CitationsPageRow[];
  selectedUrl: string | null;
  onSelect: (pageUrl: string) => void;
}) {
  const tree = useMemo(() => buildTree(rows), [rows]);
  if (rows.length === 0) {
    return <p className="text-body">No pages found in the latest generation manifest.</p>;
  }
  return (
    <div className="divide-y divide-hairline">
      {tree.map((node, i) => (
        <Branch
          key={i}
          node={node}
          depth={0}
          selectedUrl={selectedUrl}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
