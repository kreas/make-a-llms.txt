import { Resend } from 'resend';

export async function sendOtpEmail(email: string, code: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !from) {
    console.log(`\n[dev] OTP for ${email}: ${code}\n`);
    return;
  }

  const resend = new Resend(apiKey);
  await resend.emails.send({
    from,
    to: email,
    subject: 'Your sign-in code',
    text: `Your sign-in code is ${code}. It expires in 10 minutes.`,
    html: `<p>Your sign-in code is <strong style="font-size:24px;letter-spacing:4px">${code}</strong>.</p><p>It expires in 10 minutes.</p>`,
  });
}
