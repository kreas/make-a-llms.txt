import type { Tier } from './types';
import { CHECK_LABEL, TIER_LABEL, CATEGORIES, aggregateCategory } from './labels';

/** A single check as it appears in the exported report. */
export type ReportCheck = {
  id: string;
  label: string;
  passed: boolean;
  score: number;
  weight: number;
  evidence: string[];
  recommendation: string | null;
};

export type ReportCategory = { key: string; label: string; score: number };

/** Presentation-ready model for a page's citation audit, consumed by both the
 *  markdown and PDF exporters. */
export type AuditReport = {
  title: string;
  pageUrl: string;
  score: number;
  tier: Tier;
  tierLabel: string;
  fetchedAt: string;
  passingCount: number;
  failingCount: number;
  totalCount: number;
  categories: ReportCategory[];
  /** Checks sorted failing-first, matching the on-screen ordering. */
  checks: ReportCheck[];
};

type AuditResultsLike = {
  pageTitle: string | null;
  checks: {
    id: string;
    passed: boolean;
    score: number;
    weight: number;
    evidence: string[];
    recommendation: string | null;
  }[];
};

export type AuditLike = {
  pageUrl: string;
  status: 'succeeded' | 'failed';
  score: number | null;
  tier: Tier | null;
  fetchedAt: string;
  results: AuditResultsLike | null;
};

/** Build the report model from an audit, or null when the audit has no usable
 *  result (failed, in-flight, or missing a score). */
export function buildAuditReport(audit: AuditLike): AuditReport | null {
  if (audit.status !== 'succeeded' || !audit.results || audit.score === null || !audit.tier) {
    return null;
  }
  const r = audit.results;
  const checks: ReportCheck[] = [...r.checks]
    .sort((a, b) => Number(a.passed) - Number(b.passed))
    .map((c) => ({ ...c, label: CHECK_LABEL[c.id] ?? c.id }));
  const categories: ReportCategory[] = CATEGORIES.map((cat) => ({
    key: cat.key,
    label: cat.label,
    score: aggregateCategory(r.checks, cat.checkIds).score,
  }));
  const failingCount = r.checks.filter((c) => !c.passed).length;
  return {
    title: r.pageTitle?.trim() || audit.pageUrl,
    pageUrl: audit.pageUrl,
    score: audit.score,
    tier: audit.tier,
    tierLabel: TIER_LABEL[audit.tier],
    fetchedAt: audit.fetchedAt,
    passingCount: r.checks.length - failingCount,
    failingCount,
    totalCount: r.checks.length,
    categories,
    checks,
  };
}

/** Deterministic, locale-stable date for report headers (e.g. "June 16, 2026"). */
export function formatReportDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' }).format(d);
}

/** Filename slug for the exported report, derived from the page URL. */
export function reportFilenameSlug(pageUrl: string): string {
  const slug = pageUrl
    .replace(/^https?:\/\//, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return slug || 'page';
}
