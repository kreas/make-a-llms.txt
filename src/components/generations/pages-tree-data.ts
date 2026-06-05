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
