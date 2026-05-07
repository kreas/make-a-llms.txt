import { vi } from 'vitest';

/**
 * Registers vitest module mocks for the `workflow` and `workflow/api` packages.
 *
 * IMPORTANT: vitest hoists `vi.mock(...)` calls to the top of the file at
 * compile time, regardless of where they appear in source. Calling
 * `mockWorkflow()` at module scope (outside any describe/it block) is the
 * correct pattern — the hoisting guarantees the mocks are registered before
 * any import from `workflow` or `workflow/api` is resolved.
 *
 * Each step.run(name, fn) simply calls fn() synchronously (in-process).
 * step.parallel runs all fns concurrently via Promise.all.
 * Errors propagate so workflow tests can assert on thrown values.
 */
export function mockWorkflow() {
  vi.mock('workflow', () => {
    const stepRun = async (_name: string, fn: () => Promise<any>) => fn();
    const stepParallel = async (fns: Array<() => Promise<any>>) =>
      Promise.all(fns.map((p) => p()));
    return {
      workflow: (_name: string, fn: any) => fn,
      step: { run: stepRun, parallel: stepParallel },
    };
  });
  vi.mock('workflow/api', () => ({
    start: vi.fn(async () => ({ runId: 'test-run-' + Math.random() })),
  }));
}
