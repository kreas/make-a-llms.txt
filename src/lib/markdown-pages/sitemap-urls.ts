const LOC_RE = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;

function extractLocs(xml: string): string[] {
  const out: string[] = [];
  LOC_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = LOC_RE.exec(xml)) !== null) {
    out.push(m[1]);
  }
  return out;
}

async function fetchXml(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`sitemap fetch failed (${res.status}) for ${url}`);
  return res.text();
}

export async function loadSitemapUrls(sitemapUrl: string): Promise<string[]> {
  const xml = await fetchXml(sitemapUrl);
  if (/<sitemapindex[\s>]/i.test(xml)) {
    const childSitemaps = extractLocs(xml);
    const all: string[] = [];
    for (const child of childSitemaps) {
      const childXml = await fetchXml(child);
      all.push(...extractLocs(childXml));
    }
    return Array.from(new Set(all));
  }
  return Array.from(new Set(extractLocs(xml)));
}
