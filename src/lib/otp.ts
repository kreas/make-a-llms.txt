import { createHash, randomInt, timingSafeEqual } from 'node:crypto';

const OTP_TTL_MS = 10 * 60 * 1000;

export function generateOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export function hashOtp(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

export function verifyOtpHash(code: string, expected: string): boolean {
  const got = Buffer.from(hashOtp(code), 'hex');
  const want = Buffer.from(expected, 'hex');
  if (got.length !== want.length) return false;
  return timingSafeEqual(got, want);
}

export function otpExpiry(): Date {
  return new Date(Date.now() + OTP_TTL_MS);
}
