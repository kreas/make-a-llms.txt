import { vi, describe, it, expect } from 'vitest';
import { loadMdxMarkdown, loadBlogMarkdown } from './markdown';

vi.mock('./source', () => ({
  blogSource: {
    getPages: () => [
      {
        slugs: ['open-the-front-door-robots-txt'],
        data: {
          title: 'Open the Front Door! The File Every AI Reads First',
          description: 'Robots.txt is the file every AI crawler reads first. It decides whether ChatGPT, Claude, and Perplexity can cite you. Most sites still treat it as security-only.',
          date: '2026-05-24',
        },
      },
      {
        slugs: ['beyond-blue-links-aeo-geo-aio'],
        data: {
          title: 'Beyond Blue Links: Mastering AEO, GEO, and AIO in the Age of AI Search',
          description: 'AI search splits SEO into three jobs. AEO is getting cited in AI answers. GEO is getting recommended by LLMs. AIO is being a brand models already know.',
          date: '2026-05-28',
        },
      },
      {
        slugs: ['llms-txt-and-llms-full-txt'],
        data: {
          title: 'Hand the Model a Brief with llms.txt and llms-full.txt',
          description: 'llms.txt is a curated Markdown brief at your domain root. llms-full.txt adds the full content. Anthropic and Perplexity confirm they read both files.',
          date: '2026-05-28',
        },
      },
    ],
  },
}));

describe('loadMdxMarkdown', () => {
  it('returns null for an unknown slug', async () => {
    expect(await loadMdxMarkdown(['does-not-exist'])).toBeNull();
  });

  it('rejects slugs that would escape the docs directory', async () => {
    expect(await loadMdxMarkdown(['..', '..', 'package.json'])).toBeNull();
  });

  it('renders the manifesto with the frontmatter preserved and title prepended as H1', async () => {
    const md = await loadMdxMarkdown(['manifesto']);
    expect(md).not.toBeNull();
    expect(md).toMatch(/^---/);
    expect(md).toContain('# Manifesto');
    expect(md).toContain("Your website has a new audience");
  });

  it('renders the docs index when slug is empty', async () => {
    const md = await loadMdxMarkdown([]);
    expect(md).not.toBeNull();
    expect(md).toMatch(/^---/);
  });
});

describe('loadBlogMarkdown', () => {
  it('returns null for an unknown slug', async () => {
    expect(await loadBlogMarkdown(['does-not-exist'])).toBeNull();
  });

  it('renders the robots-txt article with the frontmatter preserved and title prepended as H1', async () => {
    const md = await loadBlogMarkdown(['open-the-front-door-robots-txt']);
    expect(md).not.toBeNull();
    expect(md).toMatch(/^---/);
    expect(md).toContain('title: "Open the Front Door! The File Every AI Reads First"');
    expect(md).toContain('# Open the Front Door! The File Every AI Reads First');
    expect(md).toContain("A robots.txt file is the first thing every legitimate crawler asks for");
  });

  it('renders the blog list index when slug is empty', async () => {
    const md = await loadBlogMarkdown([]);
    expect(md).not.toBeNull();
    expect(md!.split('\n')[0]).toBe('# Blog');
    expect(md).toContain('- [Open the Front Door! The File Every AI Reads First]');
    expect(md).toContain('- [Beyond Blue Links: Mastering AEO, GEO, and AIO in the Age of AI Search]');
    expect(md).toContain('- [Hand the Model a Brief with llms.txt and llms-full.txt]');
  });
});
