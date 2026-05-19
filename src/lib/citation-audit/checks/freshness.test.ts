import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { parsePage } from '../parse';
import { check } from './freshness';

const recent = (iso: string) =>
  `<html><head><script type="application/ld+json">{"@type":"Article","dateModified":"${iso}"}</script></head></html>`;
const noDate = '<html><head></head></html>';

const now = new Date('2026-05-19T00:00:00Z');
const tenMonthsAgo = '2025-07-19T00:00:00Z';
const twoYearsAgo = '2024-05-19T00:00:00Z';
const fiveYearsAgo = '2021-05-19T00:00:00Z';

describe('freshness', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); });
  afterEach(() => { vi.useRealTimers(); });

  it('100 within 18 months', () =>
    expect(check(parsePage('https://x', recent(tenMonthsAgo)), { entityName: 'X' }).score).toBe(100));
  it('50 between 18 and 36 months', () =>
    expect(check(parsePage('https://x', recent(twoYearsAgo)), { entityName: 'X' }).score).toBe(50));
  it('0 older than 36 months', () =>
    expect(check(parsePage('https://x', recent(fiveYearsAgo)), { entityName: 'X' }).score).toBe(0));
  it('0 when no date', () =>
    expect(check(parsePage('https://x', noDate), { entityName: 'X' }).score).toBe(0));
});
