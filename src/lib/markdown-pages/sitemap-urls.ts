function extractLocs(xml: string): string[] {
  const out: string[] = [];
  const re = /<loc>\s*(?:<!\[CDATA\[\s*([^\]]+?)\s*\]\]>|([^<]+?))\s*<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const value = (m[1] ?? m[2]).trim();
    if (value) out.push(value);
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
