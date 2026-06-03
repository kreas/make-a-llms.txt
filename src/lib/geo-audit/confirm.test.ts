import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai');
  return { ...actual, generateText: vi.fn() };
});

import { generateText } from 'ai';
import { confirmCandidate } from './confirm';

describe('confirmCandidate', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the structured output from the model', async () => {
    vi.mocked(generateText).mockResolvedValue({
      output: { confirmed: true, artifact: 'from $29/mo' },
    } as never);

    const res = await confirmCandidate(
      'pricing',
      { url: 'https://acme.test/pricing', path: 'pricing', markdown: 'Plans from $29/mo.' },
      'Acme',
    );

    expect(res).toEqual({ confirmed: true, artifact: 'from $29/mo' });
    const call = vi.mocked(generateText).mock.calls[0][0];
    expect(call.model).toBe('google/gemini-3.1-flash-lite');
    expect(String(call.system)).toContain('PRICING');
  });

  it('passes the correct signal prompt for case-study', async () => {
    vi.mocked(generateText).mockResolvedValue({
      output: { confirmed: false, artifact: null },
    } as never);
    await confirmCandidate(
      'case-study',
      { url: 'https://acme.test/x', path: 'x', markdown: 'y' },
      'Acme',
    );
    const call = vi.mocked(generateText).mock.calls[0][0];
    expect(String(call.system)).toContain('CASE STUDY');
  });
});
