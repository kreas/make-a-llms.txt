// Single import surface for WDK so the rest of the codebase doesn't depend
// on the package's exact API shape. Adjust here if your installed package
// uses different module paths (e.g., `@vercel/workflow`).
//
// Note: `workflow` and `step` are injected as globals by the WDK TypeScript
// plugin during compilation. They are not real exports from the package —
// the mock in tests simulates them as module exports.
import { workflow as defineWorkflow, step } from 'workflow';
import { start } from 'workflow/api';

export { defineWorkflow, step, start };

export type StepFn<T> = () => Promise<T>;

export async function runStep<T>(name: string, fn: StepFn<T>): Promise<T> {
  console.log(`[workflow.step] ${name} → start`);
  try {
    const out = await step.run(name, fn);
    console.log(`[workflow.step] ${name} → ok`);
    return out;
  } catch (err) {
    console.error(`[workflow.step] ${name} → fail`, err);
    throw err;
  }
}

export async function parallelSteps<T extends readonly unknown[]>(
  fns: { [K in keyof T]: StepFn<T[K]> },
): Promise<T> {
  return step.parallel([...fns]) as Promise<T>;
}

/**
 * Best-effort workflow cancellation. The WDK SDK at v4.2.4 does not expose a
 * programmatic cancel primitive, so this currently no-ops. Callers should also
 * mark the generation row as 'cancelled' so the UI reflects the user intent.
 */
export async function cancelRun(_runId: string): Promise<boolean> {
  console.warn('[wdk] cancelRun: WDK does not currently expose programmatic cancellation');
  return false;
}
