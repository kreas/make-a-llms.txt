export type Tier = 'poor' | 'fair' | 'good' | 'excellent';

export type AuditInput = {
  url: string;
  entityName: string;
  html: string;
  fetchedAt: string;
};

export type CheckResult = {
  id: string;
  passed: boolean;
  score: number;        // 0–100, this check's sub-score
  weight: number;       // contribution to overall
  evidence: string[];
  recommendation: string | null;
};

export type AuditResult = {
  score: number;        // 0–100 overall
  tier: Tier;
  pageTitle: string | null;
  checks: CheckResult[];
  metadata: { parseMs: number };
};

export type JsonLdBlock = Record<string, unknown>;
export type MetaTag = { name?: string; property?: string; content: string };

export type ParsedPage = {
  url: string;
  rawHtml: string;
  dom: import('jsdom').JSDOM;
  document: Document;
  jsonLd: JsonLdBlock[];
  microdata: Record<string, unknown>;
  meta: MetaTag[];
  openGraph: Record<string, string>;
  article: { title: string | null; textContent: string; lengthChars: number } | null;
  title: string | null;
  canonical: string | null;
  metaDescription: string | null;
  headings: { level: 1 | 2 | 3 | 4 | 5 | 6; text: string }[];
  links: { href: string; text: string; isInternal: boolean }[];
};

export type CheckContext = {
  entityName: string;
};

export type CheckModule = {
  ID: string;
  WEIGHT: number;
  check: (parsed: ParsedPage, ctx: CheckContext) => CheckResult;
};

export type FetchOutcome =
  | { ok: true; html: string; fetchedAt: string; fetchMs: number; browserMsUsed: number }
  | { ok: false; reason: 'http' | 'timeout' | 'auth' | 'cloudflare' | 'unknown';
      status?: number; message: string };
