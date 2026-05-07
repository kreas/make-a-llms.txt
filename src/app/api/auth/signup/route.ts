import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { users, otpCodes } from '@/db/schema';
import { generateOtp, hashOtp, otpExpiry } from '@/lib/otp';
import { sendOtpEmail } from '@/lib/email';

const schema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.email().toLowerCase(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid name or email' }, { status: 400 });
  }
  const { name, email } = parsed.data;

  const [existing] = await db.select().from(users).where(eq(users.email, email));
  if (existing) {
    return NextResponse.json({ error: 'Account already exists. Sign in instead.' }, { status: 409 });
  }

  const code = generateOtp();
  await Promise.all([
    db.insert(users).values({ name, email }),
    db.insert(otpCodes).values({
      email,
      codeHash: hashOtp(code),
      expiresAt: otpExpiry(),
    }),
    sendOtpEmail(email, code),
  ]);

  return NextResponse.json({ ok: true });
}
