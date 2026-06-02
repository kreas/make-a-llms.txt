import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai');
  return { ...actual, generateText: vi.fn() };
});

import { generateText } from 'ai';
import { classifyFromSignals } from './classify';

describe('classifyFromSignals', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the model classification', async () => {
    vi.mocked(generateText).mockResolvedValue({ output: { siteType: 'publisher', confidence: 0.86 } } as never);
    const res = await classifyFromSignals({
      histogram: { article: 14, homepage: 1, about: 1, other: 3 },
      description: 'A blog about coffee.',
      entityName: 'CoffeeBlog',
    });
    expect(res).toEqual({ siteType: 'publisher', confidence: 0.86 });
    const call = vi.mocked(generateText).mock.calls[0][0];
    expect(String(call.prompt)).toContain('article: 14');
  });

  it('clamps an out-of-range or unknown type to other', async () => {
    vi.mocked(generateText).mockResolvedValue({ output: { siteType: 'banana', confidence: 2 } } as never);
    const res = await classifyFromSignals({ histogram: {}, description: null, entityName: 'X' });
    expect(res.siteType).toBe('other');
    expect(res.confidence).toBeLessThanOrEqual(1);
    expect(res.confidence).toBeGreaterThanOrEqual(0);
  });
});
