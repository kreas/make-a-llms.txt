import {
  prepareStep,
  runGenStep,
  runFullStep,
  runPagesStepSafe,
  runSummariesStepSafe,
  completeStep,
  notifyStep,
  failStep,
  runCrawlerAuditStep,
} from './steps';

export type GenerateSiteFilesPayload = { generationId: number };

/**
 * Workflow that orchestrates the full generation pipeline.
 *
 * The 'use workflow' directive marks this function for the WDK runtime. Steps
 * (which are functions with 'use step') are durably enqueued by the runtime
 * when invoked from inside this body. Promise.all runs them in parallel.
 *
 * Outside the WDK runtime (e.g. in tests), the directives are no-ops, so this
 * function executes as a plain async — perfect for assertion-style tests.
 */
export async function generateSiteFilesWorkflow({
  generationId,
}: GenerateSiteFilesPayload): Promise<{ ok: boolean }> {
  'use workflow';

  console.log(`[workflow] generateSiteFiles start id=${generationId}`);
  try {
    const { sitemapUrl, rootUrl } = await prepareStep(generationId);

    await Promise.all([
      runGenStep(generationId, sitemapUrl),
      runFullStep(generationId, sitemapUrl),
      runPagesStepSafe(generationId, sitemapUrl, rootUrl),
    ]);

    await runSummariesStepSafe(generationId);

    await completeStep(generationId);
    await runCrawlerAuditStep(generationId);
    await notifyStep(generationId);
    console.log(`[workflow] generateSiteFiles ok id=${generationId}`);
    return { ok: true };
  } catch (err) {
    const stepName = inferStepName(err);
    console.error(
      `[workflow] generateSiteFiles fail id=${generationId} step=${stepName}`,
      err,
    );
    await failStep(generationId, stepName, err);
    return { ok: false };
  }
}

function inferStepName(err: unknown): string {
  if (err instanceof Error && err.message) {
    if (/sitemap/i.test(err.message)) return 'prepare';
    if (/llms-full|gen-full/i.test(err.message)) return 'runFull';
    if (/llms\.txt|\bgen\b/i.test(err.message)) return 'runGen';
  }
  return 'workflow';
}
