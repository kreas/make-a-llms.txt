import { generateText, Output } from 'ai';
import { z } from 'zod';
import type { GeoConfirm, GeoPageInput, GeoSignalId } from './types';

const MODEL = 'google/gemini-3.1-flash-lite';
const MAX_INPUT_CHARS = 6000;

const confirmSchema = z.object({
  confirmed: z.boolean(),
  artifact: z.string().nullable(),
});

const SYSTEM: Record<GeoSignalId, (entity: string) => string> = {
  pricing: (e) =>
    `You audit whether a web page is a genuine PUBLIC PRICING page for ${e}. Set confirmed=true only if it shows at least one visible price or named plan/tier. If confirmed, set artifact to a short price hint like "from $29/mo · 3 tiers"; otherwise artifact=null. Reply only via the structured output.`,
  comparison: (e) =>
    `You audit whether a web page directly COMPARISON-compares ${e} against a specifically named competitor. Set confirmed=true only if at least one named competitor is compared head to head. If confirmed, set artifact to the competitor name(s), comma separated; otherwise artifact=null. Reply only via the structured output.`,
  'case-study': (e) =>
    `You audit whether a web page is a genuine customer CASE STUDY for ${e} containing a concrete outcome metric (a real number: %, multiple, time, or money). Set confirmed=true only if such a metric is present. If confirmed, set artifact to the headline metric like "40% faster onboarding"; otherwise artifact=null. Reply only via the structured output.`,
};

export async function confirmCandidate(
  signal: GeoSignalId,
  page: GeoPageInput,
  entityName: string,
): Promise<GeoConfirm> {
  const { output } = await generateText({
    model: MODEL,
    output: Output.object({ schema: confirmSchema }),
    system: SYSTEM[signal](entityName),
    prompt: `URL: ${page.url}\n\n---\n${page.markdown.slice(0, MAX_INPUT_CHARS)}\n---`,
    maxRetries: 3,
  });
  return { confirmed: output.confirmed, artifact: output.artifact };
}
