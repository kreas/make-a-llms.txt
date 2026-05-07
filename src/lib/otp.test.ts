import { describe, it, expect } from 'vitest';
import { generateOtp, hashOtp, verifyOtpHash, otpExpiry } from './otp';

describe('generateOtp', () => {
  it('returns a 6-digit numeric string', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateOtp();
      expect(code).toMatch(/^\d{6}$/);
    }
  });
});

describe('verifyOtpHash', () => {
  it('returns true for matching code', () => {
    const code = '123456';
    expect(verifyOtpHash(code, hashOtp(code))).toBe(true);
  });

  it('returns false for non-matching code', () => {
    expect(verifyOtpHash('123456', hashOtp('654321'))).toBe(false);
  });

  it('returns false for malformed expected hash', () => {
    expect(verifyOtpHash('123456', 'short')).toBe(false);
  });
});

describe('otpExpiry', () => {
  it('returns a future date roughly 10 minutes out', () => {
    const before = Date.now();
    const exp = otpExpiry().getTime();
    expect(exp - before).toBeGreaterThan(9 * 60 * 1000);
    expect(exp - before).toBeLessThanOrEqual(10 * 60 * 1000 + 100);
  });
});
