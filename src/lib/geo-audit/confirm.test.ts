import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai');
  return { ...actual, generateText: vi.fn() };
});

import { generateText } from 'ai';
import { confirmCandidate } from './confirm';

describe('confirmCandidate', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses the signal registry prompt and returns structured output', async () => {
    vi.mocked(generateText).mockResolvedValue({ output: { confirmed: true, artifact: 'from $29/mo' } } as never);
    const res = await confirmCandidate('pricing', { url: 'https://acme.test/pricing', path: 'pricing', markdown: 'Plans from $29/mo.' }, 'Acme');
    expect(res).toEqual({ confirmed: true, artifact: 'from $29/mo' });
    const call = vi.mocked(generateText).mock.calls[0][0];
    expect(call.model).toBe('google/gemini-3.1-flash-lite');
    expect(String(call.system)).toContain('PRICING');
  });

  it('throws on an unknown signal id', async () => {
    await expect(confirmCandidate('nope', { url: 'x', path: 'x', markdown: 'x' }, 'Acme')).rejects.toThrow(/unknown signal/i);
  });
});
