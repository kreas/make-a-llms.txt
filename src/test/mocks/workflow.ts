import { vi } from 'vitest';

export const startedWorkflows: Array<{ workflow: any; args: any[] }> = [];

/**
 * Mock helper for code that calls `start(workflowFn, args)` from `workflow/api`.
 * Captures invocations into `startedWorkflows` for inspection. Returns a stub runId.
 *
 * Vitest hoists vi.mock to the top of the test file. This helper exists for readability
 * and must be invoked at module scope before any imports of `workflow/api`.
 */
export function mockWorkflow() {
  startedWorkflows.length = 0;
  vi.mock('workflow/api', () => ({
    start: vi.fn(async (workflow: any, args: any[]) => {
      startedWorkflows.push({ workflow, args });
      return { runId: 'test-run-' + Math.random().toString(36).slice(2, 10) };
    }),
  }));
}
