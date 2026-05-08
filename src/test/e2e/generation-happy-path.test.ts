import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Readable } from 'node:stream';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { users, generations } from '@/db/schema';
import { eq } from 'drizzle-orm';

// All vi.mock factories are hoisted to the top of the file, so any variables
// they reference must also be hoisted via vi.hoisted().
const { startMock, sentEmails, MockResend } = vi.hoisted(() => {
  const sentEmails: Record<string, unknown>[] = [];
  function MockResend(this: { emails: { send: (m: Record<string, unknown>) => Promise<void> } }) {
    this.emails = { send: async (m: Record<string, unknown>) => { sentEmails.push(m); } };
  }
  const startMock = vi.fn(async () => ({ runId: 'wf-1' }));
  return { startMock, sentEmails, MockResend };
});

vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }));
vi.mock('workflow/api', () => ({ start: startMock }));
vi.mock('execa', () => ({
  execa: vi.fn(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p: any = Promise.resolve({ stdout: '# fixture\n', stderr: '', exitCode: 0 });
    p.stdout = Readable.from([Buffer.from('# fixture\n')]);
    p.stderr = Readable.from([]);
    return p;
  }),
}));
vi.mock('@vercel/blob', () => ({
  put: vi.fn(async (path: string) => ({ url: `https://blob.test/${path}`, pathname: path })),
}));
vi.mock('@/lib/sitemap-discover', () => ({
  discoverSitemap: vi.fn(async () => 'https://acme.com/sitemap.xml'),
}));
vi.mock('resend', () => ({ Resend: MockResend }));

import { POST as POST_GENERATIONS } from '@/app/api/generations/route';
import { generateSiteFilesWorkflow } from '@/lib/workflow/generate-site-files';
import { getCurrentUser } from '@/lib/auth';

describe('generation happy path', () => {
  beforeEach(() => {
    sentEmails.length = 0;
    process.env.RESEND_API_KEY = 'test';
    process.env.PUBLIC_BASE_URL = 'http://t';
  });

  it('manual create → workflow → both files + email', async () => {
    await setupTestDb();
    const [u] = await getDb()
      .insert(users)
      .values({ name: 'A', email: 'a@a.test' })
      .returning();
    vi.mocked(getCurrentUser).mockResolvedValue(u);

    const res = await POST_GENERATIONS(
      new Request('http://t/api/generations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Acme', rootUrl: 'https://acme.com', notifyEmail: true }),
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    const generationId: number = body.generation.id;

    // Run the workflow inline (production would do this via start()).
    await generateSiteFilesWorkflow({ generationId });

    const [g] = await getDb()
      .select()
      .from(generations)
      .where(eq(generations.id, generationId));
    expect(g.status).toBe('succeeded');
    expect(g.llmsBlobPath).toBe(`gens/${generationId}/llms.txt`);
    expect(g.llmsFullBlobPath).toBe(`gens/${generationId}/llms-full.txt`);
    expect(g.notifiedAt).not.toBeNull();
    expect(sentEmails.length).toBe(1);
    expect(sentEmails[0].to).toBe('a@a.test');
  });
});
