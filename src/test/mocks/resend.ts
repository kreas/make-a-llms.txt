import { vi } from 'vitest';

export const sentEmails: Array<{ to: string; subject: string; html: string }> = [];

export function mockResend() {
  sentEmails.length = 0;
  return vi.mock('resend', () => ({
    Resend: vi.fn().mockImplementation(() => ({
      emails: {
        send: vi.fn(async ({ to, subject, html }: any) => {
          sentEmails.push({ to, subject, html });
          return { data: { id: 'test-' + Math.random() }, error: null };
        }),
      },
    })),
  }));
}
