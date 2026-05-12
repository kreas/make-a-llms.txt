import { describe, it, expect, vi } from 'vitest';
import { runWithPool } from './pool';

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe('runWithPool', () => {
  it('processes every item exactly once', async () => {
    const items = [1, 2, 3, 4, 5];
    const handler = vi.fn(async (n: number) => n * 2);
    const out = await runWithPool(items, handler, { concurrency: 2 });
    expect(handler).toHaveBeenCalledTimes(5);
    expect(out.sort((a, b) => a - b)).toEqual([2, 4, 6, 8, 10]);
  });

  it('respects the concurrency limit', async () => {
    let active = 0, peak = 0;
    await runWithPool(
      [1, 2, 3, 4, 5, 6, 7, 8],
      async () => {
        active++;
        peak = Math.max(peak, active);
        await delay(10);
        active--;
      },
      { concurrency: 3 },
    );
    expect(peak).toBeLessThanOrEqual(3);
  });

  it('captures per-item errors without aborting siblings', async () => {
    const out = await runWithPool(
      [1, 2, 3],
      async (n) => {
        if (n === 2) throw new Error('boom');
        return n;
      },
      { concurrency: 2 },
    );
    expect(out).toContain(1);
    expect(out).toContain(3);
    expect(out.find((r) => r instanceof Error)).toBeInstanceOf(Error);
  });

  it('stops issuing new work when isCancelled returns true', async () => {
    const handler = vi.fn(async (n: number) => n);
    let count = 0;
    await runWithPool([1, 2, 3, 4, 5, 6, 7, 8], handler, {
      concurrency: 2,
      isCancelled: () => ++count > 4,
    });
    expect(handler.mock.calls.length).toBeLessThan(8);
  });
});
