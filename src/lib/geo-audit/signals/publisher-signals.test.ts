import { describe, it, expect } from 'vitest';
import { getSignal } from './index';
import type { GeoPageInput } from '../types';

const page = (over: Partial<GeoPageInput>): GeoPageInput => ({ url: 'https://blog.test/post', path: 'post', markdown: '', ...over });

describe('Publisher signals', () => {
  it('author-credibility gates on bylines/author bios', () => {
    const s = getSignal('author-credibility')!;
    expect(s.gate(page({ markdown: 'By Jane Doe, Senior Editor. About the author: …' }))).not.toBeNull();
    expect(s.gate(page({ markdown: 'A post with no author.' }))).toBeNull();
  });

  it('cited-sources gates on references/citations', () => {
    const s = getSignal('cited-sources')!;
    expect(s.gate(page({ markdown: 'According to a study [1]. References: https://example.com/source' }))).not.toBeNull();
  });

  it('original-data gates on first-party data language', () => {
    const s = getSignal('original-data')!;
    expect(s.gate(page({ markdown: 'Our survey of 1,200 users found that 63% …' }))).not.toBeNull();
  });
});
