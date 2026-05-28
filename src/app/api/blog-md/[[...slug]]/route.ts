import { NextResponse } from 'next/server';
import { loadBlogMarkdown } from '@/lib/docs/markdown';

type Params = Promise<{ slug?: string[] }>;

export async function GET(_req: Request, { params }: { params: Params }) {
  const { slug = [] } = await params;
  const markdown = await loadBlogMarkdown(slug);
  if (!markdown) {
    return new NextResponse('Not found', { status: 404 });
  }
  return new NextResponse(markdown, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=60',
    },
  });
}
