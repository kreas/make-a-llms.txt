import type { GeoSignalDef } from '../types';

const RX = /\b(why choose|why us|what makes us|unlike|the only|different from|vs\.?|compared to|our approach|what sets us apart)\b/i;

export const differentiation: GeoSignalDef = {
  id: 'differentiation',
  label: 'Differentiation',
  tags: ['value'],
  defaultWeight: 15,
  urlPatterns: ['**/', '**/about**', '**/why**'],
  gate: (p) =>
    RX.test(p.markdown)
      ? { signalId: 'differentiation', url: p.url, path: p.path, reason: 'Contains positioning / "why us" language' }
      : null,
  confirmPrompt: (e) =>
    `You audit whether a web page states a clear DIFFERENTIATION for ${e} — a concrete "why choose us" / what-makes-us-different positioning (not vague marketing). Set confirmed=true only if there is a specific stance a buyer could repeat. If confirmed, set artifact to a one-line paraphrase of the differentiator; otherwise artifact=null. Reply only via the structured output.`,
  recommendation: 'State a clear, concrete "why us" — the specific thing that sets you apart. AI needs a repeatable reason to pick you over alternatives.',
};
