import { vi, describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

// Mock the generated .source/server to prevent load errors
vi.mock('../../../.source/server', () => ({
  blog: { toFumadocsSource: vi.fn() },
  docs: { toFumadocsSource: vi.fn() },
}));

// Mock the loader from fumadocs-core/source to return our controlled mock methods
vi.mock('fumadocs-core/source', () => ({
  loader: vi.fn((config) => {
    return {
      getPage: vi.fn(([slug]) => {
        if (slug === 'beyond-blue-links-aeo-geo-aio') {
          return {
            data: {
              title: 'Beyond Blue Links',
              description: 'AI Search Optimization',
              date: '2026-05-28',
              updated: '2026-05-29',
              readingTime: '6 min',
              category: 'AI Search Optimization',
              canonical: 'https://www.aiready.cat/blog/beyond-blue-links-aeo-geo-aio',
              schema: 'Article',
              tags: ['AEO', 'GEO', 'AIO'],
              image: '/images/blog/beyond-blue-links.webp',
              author: {
                name: 'Timothy Warren',
                url: 'https://www.aiready.cat/about',
                sameAs: ['https://www.linkedin.com/in/timothywarren'],
              },
              body: () => null,
            },
          };
        }
        return null;
      }),
      getPages: vi.fn(() => [
        {
          url: '/blog/beyond-blue-links-aeo-geo-aio',
          slugs: ['beyond-blue-links-aeo-geo-aio'],
          data: {
            title: 'Beyond Blue Links',
            description: 'AI Search Optimization',
            date: '2026-05-28',
            readingTime: '6 min',
            category: 'AI Search Optimization',
            body: () => null,
          },
        },
      ]),
      generateParams: vi.fn(() => [{ slug: ['beyond-blue-links-aeo-geo-aio'] }]),
      pageTree: { children: [] },
    };
  }),
}));

// Mock openapi module which is imported by source.ts
vi.mock('@/lib/docs/openapi', () => ({
  openapi: {},
}));

// Mock openapiSource from fumadocs-openapi
vi.mock('fumadocs-openapi/server', () => ({
  openapiSource: vi.fn(async () => ({})),
}));

// Mock auth module
vi.mock('@/lib/auth', () => ({
  getCurrentUser: vi.fn(async () => null),
}));

// Mock next/navigation
vi.mock('next/navigation', () => ({
  notFound: vi.fn(),
}));

describe('blog loader and pages', () => {
  it('loads source and parses pages correctly with mock loader', async () => {
    const { blogSource } = await import('@/lib/docs/source');
    expect(blogSource).toBeDefined();

    const pages = blogSource.getPages();
    expect(pages).toBeDefined();
    expect(pages.length).toBeGreaterThan(0);

    const post = pages.find((p) => p.slugs[0] === 'beyond-blue-links-aeo-geo-aio');
    expect(post).toBeDefined();
    expect(post?.data.title).toContain('Beyond Blue Links');

    const page = blogSource.getPage(['beyond-blue-links-aeo-geo-aio']);
    expect(page).toBeDefined();
    expect(page?.data.description).toBe('AI Search Optimization');
  });

  it('renders JSON-LD structured data on the blog post page', async () => {
    const BlogPostPage = (await import('./[slug]/page')).default;
    const params = Promise.resolve({ slug: 'beyond-blue-links-aeo-geo-aio' });
    const jsx = await BlogPostPage({ params });

    const { container } = render(jsx);
    const script = container.querySelector('script[type="application/ld+json"]');
    expect(script).toBeInTheDocument();

    const data = JSON.parse(script?.innerHTML || '{}');
    expect(data['@context']).toBe('https://schema.org');
    expect(data['@type']).toBe('Article');
    expect(data.headline).toBe('Beyond Blue Links');
    expect(data.description).toBe('AI Search Optimization');
    expect(data.datePublished).toBe('2026-05-28');
    expect(data.dateModified).toBe('2026-05-29');
    expect(data.mainEntityOfPage).toEqual({
      '@type': 'WebPage',
      '@id': 'https://www.aiready.cat/blog/beyond-blue-links-aeo-geo-aio',
    });
    expect(data.url).toBe('https://www.aiready.cat/blog/beyond-blue-links-aeo-geo-aio');
    expect(data.image).toBe('https://www.aiready.cat/images/blog/beyond-blue-links.webp');
    expect(data.author).toEqual({
      '@type': 'Person',
      name: 'Timothy Warren',
      url: 'https://www.aiready.cat/about',
      sameAs: ['https://www.linkedin.com/in/timothywarren'],
    });
    expect(data.publisher).toEqual({
      '@type': 'Organization',
      name: 'AI Ready',
      url: 'https://www.aiready.cat',
      logo: {
        '@type': 'ImageObject',
        url: 'https://www.aiready.cat/logo-v4.png',
      },
    });
    expect(data.articleSection).toBe('AI Search Optimization');
    expect(data.keywords).toBe('AEO, GEO, AIO');
  });
});
