'use step';

export async function discoverSitemap(rootUrl: string): Promise<string> {
  console.log(`[sitemap-discover] start root=${rootUrl}`);
  const root = rootUrl.replace(/\/$/, '');

  const candidates = [`${root}/sitemap.xml`, `${root}/sitemap_index.xml`];
  for (const url of candidates) {
    const res = await safeFetch(url);
    if (res?.ok) {
      console.log(`[sitemap-discover] hit ${url}`);
      return url;
    }
  }

  const robotsRes = await safeFetch(`${root}/robots.txt`);
  if (robotsRes?.ok) {
    const body = await robotsRes.text();
    const match = body.match(/^\s*Sitemap:\s*(\S+)\s*$/im);
    if (match) {
      const fromRobots = match[1];
      const res = await safeFetch(fromRobots);
      if (res?.ok) {
        console.log(`[sitemap-discover] hit (via robots) ${fromRobots}`);
        return fromRobots;
      }
    }
  }

  console.error(`[sitemap-discover] miss for ${root}`);
  throw new Error('No sitemap found. Add a sitemap URL on the site page.');
}

async function safeFetch(url: string): Promise<Response | null> {
  try {
    return await fetch(url);
  } catch {
    return null;
  }
}
