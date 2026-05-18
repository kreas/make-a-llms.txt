import { describe, it, expect } from 'vitest';
import { generateUid, parseUid, uidSchema } from './uid';

describe('uid helpers', () => {
  it('generateUid returns a valid UUIDv4 string', () => {
    const u = generateUid();
    expect(u).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('generateUid returns a different value each call', () => {
    expect(generateUid()).not.toBe(generateUid());
  });

  it('uidSchema accepts a valid UUID', () => {
    const u = generateUid();
    expect(uidSchema.parse(u)).toBe(u);
  });

  it('parseUid throws on a non-UUID string', () => {
    expect(() => parseUid('not-a-uuid')).toThrow();
    expect(() => parseUid('1')).toThrow();
    expect(() => parseUid('')).toThrow();
  });
});
