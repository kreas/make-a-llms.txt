import {
  prepareStep,
  runGenStep,
  runFullStep,
  runPagesStepSafe,
  completeStep,
  notifyStep,
  failStep,
} from './steps';

export type GenerateSiteFilesPayload = { generationId: number };

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

    await completeStep(generationId);
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
