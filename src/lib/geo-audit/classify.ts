import { generateText, Output } from 'ai';
import { z } from 'zod';
import type { SiteType } from './types';
import { PROFILES } from './profiles';

const MODEL = 'google/gemini-3.1-flash-lite';
const TYPES: SiteType[] = ['saas', 'ecommerce', 'local', 'publisher', 'services', 'other'];

const schema = z.object({
  siteType: z.string(),
  confidence: z.number(),
});

function profileHints(): string {
  return TYPES.map((t) => `- ${t}: ${PROFILES[t].detectionHint}`).join('\n');
}

export type ClassifyInput = {
  histogram: Record<string, number>;   // page_type → count
  description: string | null;
  entityName: string;
};

export async function classifyFromSignals(input: ClassifyInput): Promise<{ siteType: SiteType; confidence: number }> {
  const hist = Object.entries(input.histogram)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ') || '(none)';

  const { output } = await generateText({
    model: MODEL,
    output: Output.object({ schema }),
    system: `You classify a website into exactly one type. Types:\n${profileHints()}\nReturn the best-fit type id and a confidence 0–1. If unclear, use "other" with low confidence.`,
    prompt: `Entity: ${input.entityName}\nDescription: ${input.description ?? '(none)'}\nPage-type counts: ${hist}\n\nClassify.`,
    maxRetries: 3,
  });

  const siteType = (TYPES as string[]).includes(output.siteType) ? (output.siteType as SiteType) : 'other';
  const confidence = Math.max(0, Math.min(1, Number(output.confidence) || 0));
  return { siteType, confidence };
}
