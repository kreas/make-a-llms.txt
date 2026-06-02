import type { GeoSignalDef } from '../types';

const RX = /\b(years of experience|since \d{4}|founded in \d{4}|our team|meet the team|our (experts|specialists)|board[- ]certified|ph\.?d\.?|m\.?d\.?|licensed|credential|qualified|expert in|specializ(?:e|es|ing) in)\b/i;

export const expertiseSignals: GeoSignalDef = {
  id: 'expertise-signals',
  label: 'Demonstrated expertise',
  tags: ['trust'],
  defaultWeight: 25,
  urlPatterns: ['**/', '**/about**', '**/team**'],
  gate: (p) =>
    RX.test(p.markdown)
      ? { signalId: 'expertise-signals', url: p.url, path: p.path, reason: 'Experience / credentials / team expertise present' }
      : null,
  confirmPrompt: (e) =>
    `You audit whether a web page demonstrates first-hand EXPERTISE for ${e} (E-E-A-T) — named experts, professional credentials, qualifications, or substantial relevant experience that justifies trusting this source. Set confirmed=true only if real credentials or experience are shown. If confirmed, set artifact like "board-certified team · 15+ yrs"; otherwise artifact=null. Reply only via the structured output.`,
  recommendation: 'Show your expertise — named experts, credentials, qualifications, or years of experience. AI favors sources with demonstrable E-E-A-T.',
};
