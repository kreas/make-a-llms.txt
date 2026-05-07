import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { users, otpCodes } from '@/db/schema';
import { generateOtp, hashOtp, otpExpiry } from '@/lib/otp';
import { sendOtpEmail } from '@/lib/email';

const schema = z.object({
  email: z.email().toLowerCase(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
  }
  const { email } = parsed.data;

  const [user] = await db.select().from(users).where(eq(users.email, email));
  if (!user) {
    return NextResponse.json({ error: 'No account found. Sign up first.' }, { status: 400 });
  }

  const code = generateOtp();
  await Promise.all([
    db.insert(otpCodes).values({
      email,
      codeHash: hashOtp(code),
      expiresAt: otpExpiry(),
    }),
    sendOtpEmail(email, code),
  ]);

  return NextResponse.json({ ok: true });
}
