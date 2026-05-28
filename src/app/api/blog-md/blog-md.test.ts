import { vi, describe, it, expect } from 'vitest';
import { GET } from './[[...slug]]/route';

vi.mock('@/lib/docs/markdown', () => ({
  loadBlogMarkdown: vi.fn(async (slug: string[]) => {
    if (slug.length === 0) {
      return '# Blog\n\n- [Test Post](/blog/test-post.md)';
    }
    if (slug[0] === 'test-post') {
      return '# Test Post\n\nThis is a test post.';
    }
    return null;
  }),
}));

const ctx = (slug?: string[]) => ({
  params: Promise.resolve({ slug }),
});

describe('GET /api/blog-md/[[...slug]]', () => {
  it('returns raw markdown list of articles for empty slug', async () => {
    const res = await GET(new Request('http://localhost:4242/blog.md'), ctx([]));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/markdown; charset=utf-8');
    const text = await res.text();
    expect(text).toContain('# Blog');
    expect(text).toContain('- [Test Post](/blog/test-post.md)');
  });

  it('returns raw markdown for a specific article', async () => {
    const res = await GET(new Request('http://localhost:4242/blog/test-post.md'), ctx(['test-post']));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/markdown; charset=utf-8');
    const text = await res.text();
    expect(text).toBe('# Test Post\n\nThis is a test post.');
  });

  it('returns 404 for an unknown article slug', async () => {
    const res = await GET(new Request('http://localhost:4242/blog/unknown.md'), ctx(['unknown']));
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('Not found');
  });
});
