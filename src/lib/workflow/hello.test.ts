import { describe, it, expect, vi } from 'vitest';

vi.mock('workflow', () => {
  const stepRun = async (_name: string, fn: () => Promise<any>) => fn();
  const stepParallel = async (fns: Array<() => Promise<any>>) =>
    Promise.all(fns.map((f) => f()));
  return {
    workflow: (_name: string, fn: any) => fn,
    step: { run: stepRun, parallel: stepParallel },
  };
});
vi.mock('workflow/api', () => ({
  start: vi.fn(async () => ({ runId: 'r1' })),
  cancel: vi.fn(async () => true),
}));

import { runHello } from './hello';

describe('runHello', () => {
  it('runs end to end and returns the greeting', async () => {
    const out = await runHello({ name: 'world' });
    expect(out).toBe('hello, world');
  });
});
