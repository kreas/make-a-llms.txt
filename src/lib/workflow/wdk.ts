// Single import surface for WDK so the rest of the codebase doesn't depend
// on the package's exact API shape. Adjust here if your installed package
// uses different module paths (e.g., `@vercel/workflow`).
//
// Note: `workflow` and `step` are injected as globals by the WDK TypeScript
// plugin during compilation. They are not real exports from the package —
// the mock in tests simulates them as module exports.
import { workflow as defineWorkflow, step } from 'workflow';
import { start, cancel } from 'workflow/api';

export { defineWorkflow, step, start, cancel };

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
