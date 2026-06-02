import { generateText, Output } from 'ai';
import { z } from 'zod';
import type { GeoConfirm, GeoPageInput } from './types';
import { getSignal } from './signals/index';

const MODEL = 'google/gemini-3.1-flash-lite';
const MAX_INPUT_CHARS = 6000;

const confirmSchema = z.object({
  confirmed: z.boolean(),
  artifact: z.string().nullable(),
});

export async function confirmCandidate(
  signalId: string,
  page: GeoPageInput,
  entityName: string,
): Promise<GeoConfirm> {
  const sig = getSignal(signalId);
  if (!sig) throw new Error(`unknown signal: ${signalId}`);
  const { output } = await generateText({
    model: MODEL,
    output: Output.object({ schema: confirmSchema }),
    system: sig.confirmPrompt(entityName),
    prompt: `URL: ${page.url}\n\n---\n${page.markdown.slice(0, MAX_INPUT_CHARS)}\n---`,
    maxRetries: 3,
  });
  return { confirmed: output.confirmed, artifact: output.artifact };
}
