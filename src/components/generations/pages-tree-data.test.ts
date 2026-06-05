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
    const top = data[ROOT_ID].childrenIds;
    expect(top.indexOf('index')).toBeLessThan(top.indexOf('about'));
    expect(top.indexOf('about')).toBeLessThan(top.indexOf('services'));
    expect(data['services'].total).toBe(2);
    expect(data['services'].okCount).toBe(1);
  });

  it('skips pages with a null path and ignores duplicate paths', () => {
    const data = buildPageTreeData([
      { url: 'https://x.com/', path: null, filename: null, status: 'skipped', blobPath: null },
      page('about'),
      page('about'), // duplicate
    ]);
    expect(data[ROOT_ID].childrenIds).toEqual(['about']);
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
    expect(ids).toContain('a');
    expect(ids).toContain('services');
    expect(ids).toContain('a/b');
  });
});
