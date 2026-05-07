import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { users, otpCodes } from '@/db/schema';
import { createSession } from '@/lib/auth';
import { verifyOtpHash } from '@/lib/otp';

const schema = z.object({
  email: z.email().toLowerCase(),
  code: z.string().regex(/^\d{6}$/),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid email or code' }, { status: 400 });
  }
  const { email, code } = parsed.data;

  const [otp] = await db
    .select()
    .from(otpCodes)
    .where(
      and(eq(otpCodes.email, email), isNull(otpCodes.consumedAt), gt(otpCodes.expiresAt, new Date())),
    )
    .orderBy(desc(otpCodes.id))
    .limit(1);

  if (!otp || !verifyOtpHash(code, otp.codeHash)) {
    return NextResponse.json({ error: 'Invalid or expired code' }, { status: 401 });
  }

  await db.update(otpCodes).set({ consumedAt: new Date() }).where(eq(otpCodes.id, otp.id));

  const [user] = await db.select().from(users).where(eq(users.email, email));
  if (!user) {
    return NextResponse.json({ error: 'Account not found' }, { status: 400 });
  }

  await createSession({ userId: user.id, email: user.email });
  return NextResponse.json({ ok: true });
}
