import { NextResponse, type NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === '/docs.md') {
    return NextResponse.rewrite(new URL('/api/docs-md', request.url));
  }

  if (pathname.startsWith('/docs/') && pathname.endsWith('.md')) {
    const slug = pathname.slice('/docs/'.length, -'.md'.length);
    return NextResponse.rewrite(
      new URL(`/api/docs-md/${slug}`, request.url),
    );
  }

  if (pathname === '/blog.md') {
    return NextResponse.rewrite(new URL('/api/blog-md', request.url));
  }

  if (pathname.startsWith('/blog/') && pathname.endsWith('.md')) {
    const slug = pathname.slice('/blog/'.length, -'.md'.length);
    return NextResponse.rewrite(
      new URL(`/api/blog-md/${slug}`, request.url),
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/docs.md', '/docs/:path*', '/blog.md', '/blog/:path*'],
};
