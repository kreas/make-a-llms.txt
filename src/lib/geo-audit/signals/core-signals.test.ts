import { describe, it, expect } from 'vitest';
import { getSignal } from './index';
import type { GeoPageInput } from '../types';

const page = (over: Partial<GeoPageInput>): GeoPageInput => ({ url: 'https://x.test/', path: 'index', markdown: '', ...over });

describe('new core signals', () => {
  it('all four are registered', () => {
    for (const id of ['topical-depth', 'verifiable-proofs', 'expertise-signals', 'ratings-reviews']) {
      expect(getSignal(id)?.id).toBe(id);
    }
  });

  it('topical-depth gates on long multi-section content', () => {
    const md = '## A\n' + 'x'.repeat(500) + '\n## B\n' + 'y'.repeat(500) + '\n## C\n' + 'z'.repeat(500);
    expect(getSignal('topical-depth')!.gate(page({ markdown: md }))).not.toBeNull();
    expect(getSignal('topical-depth')!.gate(page({ markdown: 'Thin page.' }))).toBeNull();
  });

  it('verifiable-proofs gates on certifications/awards', () => {
    expect(getSignal('verifiable-proofs')!.gate(page({ markdown: 'We are ISO 9001 certified and award-winning.' }))).not.toBeNull();
  });

  it('expertise-signals gates on credentials/experience', () => {
    expect(getSignal('expertise-signals')!.gate(page({ markdown: 'Our board-certified team has 15 years of experience.' }))).not.toBeNull();
  });

  it('ratings-reviews gates on numeric ratings', () => {
    expect(getSignal('ratings-reviews')!.gate(page({ markdown: 'Rated 4.8/5 from 320 reviews.' }))).not.toBeNull();
    expect(getSignal('ratings-reviews')!.gate(page({ markdown: 'People love us.' }))).toBeNull();
  });
});
