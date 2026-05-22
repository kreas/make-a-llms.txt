export type MappedUrl =
  | { url: string; path: string; filename: string; status: 'ok' }
  | { url: string; path: null; filename: null; status: 'skipped'; reason: string };

const SAFE = /[^A-Za-z0-9._-]+/g;

function sanitizeSegment(seg: string): string {
  const decoded = (() => {
    try {
      return decodeURIComponent(seg);
    } catch {
      return seg;
    }
  })();
  const stripped = decoded.replace(/\.{2,}/g, '-').replace(/^\.+|\.+$/g, '');
  return stripped.replace(SAFE, '-').replace(/^-+|-+$/g, '');
}

function normalizeUrl(input: string): string | null {
  try {
    const u = new URL(input);
    u.hash = '';
    u.search = '';
    let pathname = u.pathname.replace(/\/+$/, '');
    if (pathname === '') pathname = '/';
    return `${u.origin}${pathname}`;
  } catch {
    return null;
  }
}

function cleanHost(host: string): string {
  return host.replace(/^www\./i, '');
}

export function mapUrlsToPaths(urls: string[], rootUrl: string): MappedUrl[] {
  const rootHostClean = cleanHost(new URL(rootUrl).hostname);
  const seen = new Map<string, MappedUrl>();
  const usedPaths = new Set<string>();

  for (const raw of urls) {
    const normalized = normalizeUrl(raw);
    if (!normalized) {
      if (!seen.has(raw)) {
        seen.set(raw, { url: raw, path: null, filename: null, status: 'skipped', reason: 'invalid-url' });
      }
      continue;
    }
    if (seen.has(normalized)) continue;

    const u = new URL(normalized);
    if (cleanHost(u.hostname) !== rootHostClean) {
      seen.set(normalized, {
        url: normalized,
        path: null,
        filename: null,
        status: 'skipped',
        reason: 'cross-origin',
      });
      continue;
    }

    const pathname = u.pathname === '/' ? '/index' : u.pathname.replace(/\.(html?|HTML?)$/, '');
    const segments = pathname.split('/').filter(Boolean).map(sanitizeSegment).filter(Boolean);
    let basePath = segments.join('/');
    if (basePath === '') basePath = 'index';

    let unique = basePath;
    let n = 1;
    while (usedPaths.has(unique)) {
      unique = `${basePath}-${n++}`;
    }
    usedPaths.add(unique);

    const filename = `${unique.split('/').pop()!}.md`;
    seen.set(normalized, { url: normalized, path: unique, filename, status: 'ok' });
  }
  return Array.from(seen.values());
}
