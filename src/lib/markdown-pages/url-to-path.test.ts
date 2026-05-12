import { describe, it, expect } from 'vitest';
import { mapUrlsToPaths } from './url-to-path';

describe('mapUrlsToPaths', () => {
  const root = 'https://example.com';

  it('maps / to index.md', () => {
    const out = mapUrlsToPaths(['https://example.com/'], root);
    expect(out[0]).toMatchObject({ path: 'index', filename: 'index.md', status: 'ok' });
  });

  it('drops query string and fragment', () => {
    const out = mapUrlsToPaths(['https://example.com/docs/cdn?x=1#top'], root);
    expect(out[0]).toMatchObject({ path: 'docs/cdn', filename: 'cdn.md' });
  });

  it('rewrites .html and .htm to .md', () => {
    const out = mapUrlsToPaths(
      ['https://example.com/a.html', 'https://example.com/b.htm'],
      root,
    );
    expect(out[0].filename).toBe('a.md');
    expect(out[1].filename).toBe('b.md');
  });

  it('marks cross-origin urls as skipped', () => {
    const out = mapUrlsToPaths(['https://other.com/page'], root);
    expect(out[0]).toMatchObject({ status: 'skipped', reason: 'cross-origin' });
  });

  it('deduplicates identical urls', () => {
    const out = mapUrlsToPaths(
      ['https://example.com/a', 'https://example.com/a/'],
      root,
    );
    expect(out).toHaveLength(1);
  });

  it('suffixes collisions deterministically', () => {
    const out = mapUrlsToPaths(
      ['https://example.com/Foo', 'https://example.com/foo'],
      root,
    );
    expect(out.map((e) => e.path).sort()).toEqual(['Foo', 'foo']);
  });

  it('sanitizes unsafe segments', () => {
    const out = mapUrlsToPaths(['https://example.com/a%20b/c..d'], root);
    expect(out[0].path).toBe('a-b/c-d');
  });
});
