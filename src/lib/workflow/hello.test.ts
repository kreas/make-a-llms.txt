import { describe, it, expect } from 'vitest';
import { helloWorkflow } from './hello';

describe('helloWorkflow', () => {
  it('returns the greeting end-to-end', async () => {
    const out = await helloWorkflow({ name: 'world' });
    expect(out).toBe('hello, world');
  });
});
