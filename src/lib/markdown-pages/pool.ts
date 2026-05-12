export type PoolOptions = {
  concurrency: number;
  isCancelled?: () => boolean | Promise<boolean>;
};

export async function runWithPool<T, R>(
  items: T[],
  handler: (item: T, index: number) => Promise<R>,
  opts: PoolOptions,
): Promise<(R | Error)[]> {
  if (opts.concurrency < 1) {
    throw new Error(`runWithPool: concurrency must be >= 1, got ${opts.concurrency}`);
  }

  const results = new Array<R | Error>(items.length);
  let next = 0;
  const inflight = new Set<Promise<void>>();

  const spawn = (): void => {
    if (next >= items.length) return;
    const idx = next++;
    const p = (async () => {
      try {
        results[idx] = await handler(items[idx], idx);
      } catch (err) {
        results[idx] = err instanceof Error ? err : new Error(String(err));
      }
    })().finally(() => {
      inflight.delete(p);
    });
    inflight.add(p);
  };

  while (next < items.length) {
    // Outer: re-check after each Promise.race wake-up.
    if (opts.isCancelled && (await opts.isCancelled())) break;
    while (inflight.size < opts.concurrency && next < items.length) {
      // Inner: stop filling mid-burst even if concurrency > 1.
      if (opts.isCancelled && (await opts.isCancelled())) break;
      spawn();
    }
    if (inflight.size === 0) break;
    await Promise.race(inflight);
  }
  const dispatched = next;
  await Promise.all(inflight);
  return results.slice(0, dispatched) as (R | Error)[];
}
