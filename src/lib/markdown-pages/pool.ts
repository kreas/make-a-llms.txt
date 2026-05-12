export type PoolOptions = {
  concurrency: number;
  isCancelled?: () => boolean | Promise<boolean>;
};

export async function runWithPool<T, R>(
  items: T[],
  handler: (item: T, index: number) => Promise<R>,
  opts: PoolOptions,
): Promise<(R | Error)[]> {
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
    if (opts.isCancelled && (await opts.isCancelled())) break;
    while (inflight.size < opts.concurrency && next < items.length) {
      if (opts.isCancelled && (await opts.isCancelled())) break;
      spawn();
    }
    if (inflight.size === 0) break;
    await Promise.race(inflight);
  }
  await Promise.all(inflight);
  return results.filter((r) => r !== undefined) as (R | Error)[];
}
