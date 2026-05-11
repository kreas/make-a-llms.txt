import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatRelativeTime } from './format-time';

afterEach(() => {
  vi.useRealTimers();
});

describe('formatRelativeTime', () => {
  it('returns "Just now" for timestamps within the last minute', () => {
    const now = new Date('2026-05-11T12:00:00Z');
    vi.setSystemTime(now);
    const iso = new Date(now.getTime() - 30_000).toISOString();
    expect(formatRelativeTime(iso)).toBe('Just now');
  });

  it('returns minutes ago for timestamps within the last hour', () => {
    const now = new Date('2026-05-11T12:00:00Z');
    vi.setSystemTime(now);
    const iso = new Date(now.getTime() - 5 * 60_000).toISOString();
    expect(formatRelativeTime(iso)).toBe('5 mins ago');
  });

  it('returns hours ago for timestamps within the last day', () => {
    const now = new Date('2026-05-11T12:00:00Z');
    vi.setSystemTime(now);
    const iso = new Date(now.getTime() - 3 * 60 * 60_000).toISOString();
    expect(formatRelativeTime(iso)).toBe('3 hrs ago');
  });

  it('returns "Yesterday" for timestamps ~24h ago', () => {
    const now = new Date('2026-05-11T12:00:00Z');
    vi.setSystemTime(now);
    const iso = new Date(now.getTime() - 24 * 60 * 60_000).toISOString();
    expect(formatRelativeTime(iso)).toBe('Yesterday');
  });
});
