import { describe, it, expect } from 'vitest';
import { loadMdxMarkdown } from './markdown';

describe('loadMdxMarkdown', () => {
  it('returns null for an unknown slug', async () => {
    expect(await loadMdxMarkdown(['does-not-exist'])).toBeNull();
  });

  it('rejects slugs that would escape the docs directory', async () => {
    expect(await loadMdxMarkdown(['..', '..', 'package.json'])).toBeNull();
  });

  it('renders the manifesto with the frontmatter title prepended as H1', async () => {
    const md = await loadMdxMarkdown(['manifesto']);
    expect(md).not.toBeNull();
    expect(md!.split('\n')[0]).toBe('# Manifesto');
    expect(md).not.toMatch(/^---/);
    expect(md).toContain("Your website has a new audience");
  });

  it('renders the docs index when slug is empty', async () => {
    const md = await loadMdxMarkdown([]);
    expect(md).not.toBeNull();
    expect(md).toMatch(/^#\s+/);
  });
});
