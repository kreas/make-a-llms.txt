import type { GeoSignalDef } from '../types';

const RX = /\b(certified|certification|iso\s?\d{3,}|accredited|accreditation|licensed|insured|guarantee|warranty|award[- ]winning|awards?|winner|verified|compliance|hipaa|soc\s?2|pci|gdpr)\b/i;

export const verifiableProofs: GeoSignalDef = {
  id: 'verifiable-proofs',
  label: 'Verifiable proofs',
  tags: ['trust'],
  defaultWeight: 25,
  urlPatterns: ['**/', '**/about**', '**/certifications**'],
  gate: (p) =>
    RX.test(p.markdown)
      ? { signalId: 'verifiable-proofs', url: p.url, path: p.path, reason: 'Certification/guarantee/award language present' }
      : null,
  confirmPrompt: (e) =>
    `You audit whether a web page shows VERIFIABLE PROOFS for ${e} — specific certifications, licenses, accreditations, guarantees, or awards that back up claims (not vague marketing like "world-class"). Set confirmed=true only if a specific, named proof is present. If confirmed, set artifact like "ISO 9001 certified · 30-day guarantee"; otherwise artifact=null. Reply only via the structured output.`,
  recommendation: 'Show verifiable proof — certifications, licenses, guarantees, or awards — that backs your claims. AI weighs machine-verifiable trust signals.',
};
