// Workflow SDK uses TypeScript directives ('use workflow' / 'use step')
// to mark functions for the workflow runtime. There is no defineWorkflow()
// or step.run() — workflows ARE functions, and you call them via start().
//
// This module re-exports the bits we use elsewhere so the rest of the
// codebase has one import point.
export { start } from 'workflow/api';
export { FatalError, RetryableError } from 'workflow';

/**
 * Best-effort cancellation. The WDK at v4.2.4 does not expose a programmatic
 * cancel primitive, so this is a no-op stub. Callers should also mark the
 * generation row as 'cancelled' to surface user intent.
 */
export async function cancelRun(_runId: string): Promise<boolean> {
  console.warn('[wdk] cancelRun: WDK does not currently expose programmatic cancellation');
  return false;
}
