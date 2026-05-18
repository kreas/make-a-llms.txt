import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@vercel/blob', () => ({
  get: vi.fn(),
  put: vi.fn(async (pathname: string) => ({ url: `https://blob.test/${pathname}`, pathname })),
}));
vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai');
  return {
    ...actual,
    generateText: vi.fn(),
  };
});

import { get, put } from '@vercel/blob';
import { generateText } from 'ai';
import { summarizePage } from './summarize-page';

function mockBlob(text: string) {
  vi.mocked(get).mockResolvedValue({
    stream: new Response(text).body!,
    pathname: 'p',
    url: 'u',
    contentType: 'text/markdown; charset=utf-8',
    contentDisposition: '',
    size: text.length,
    uploadedAt: new Date(),
    downloadUrl: 'u',
  } as any);
}

const PAGE = {
  url: 'https://x.test/about',
  path: 'about',
  filename: 'about.md',
  status: 'ok' as const,
  blobPath: 'gens/1/pages/about.md',
  bytes: 200,
  durationMs: 5,
};

const BLOB_CONTENT =
  'title: About\n' +
  'url: https://x.test/about\n' +
  'summary: \n' +
  'updated: 2026-05-14\n\n' +
  '# About\n\nWe build AI tools.\n';

describe('summarizePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('happy path: writes summary and page_type into frontmatter', async () => {
    mockBlob(BLOB_CONTENT);
    vi.mocked(generateText).mockResolvedValue({
      output: { summary: 'Acme builds AI tools.', page_type: 'about' },
    } as any);

    const result = await summarizePage({
      generationId: 1,
      page: PAGE,
      siteName: 'Acme',
      maxInputBytes: 1_000_000,
    });

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.pageType).toBe('about');
      expect(result.summaryBytes).toBeGreaterThan(0);
    }
    expect(put).toHaveBeenCalledTimes(1);
    const [pathArg, bodyArg] = vi.mocked(put).mock.calls[0];
    expect(pathArg).toBe('gens/1/pages/about.md');
    expect(bodyArg).toMatch(/^summary: Acme builds AI tools\.$/m);
    expect(bodyArg).toMatch(/^page_type: about$/m);
    expect(bodyArg).toMatch(/# About\n\nWe build AI tools\./);
  });

  it('NO_SUMMARY: rewrites blob with empty summary, keeps page_type', async () => {
    mockBlob(BLOB_CONTENT);
    vi.mocked(generateText).mockResolvedValue({
      output: { summary: '[NO_SUMMARY]', page_type: 'other' },
    } as any);

    const result = await summarizePage({
      generationId: 1,
      page: PAGE,
      siteName: 'Acme',
      maxInputBytes: 1_000_000,
    });

    expect(result.status).toBe('empty');
    if (result.status === 'empty') {
      expect(result.pageType).toBe('other');
    }
    const [, bodyArg] = vi.mocked(put).mock.calls[0];
    expect(bodyArg).toMatch(/^summary: $/m);
    expect(bodyArg).toMatch(/^page_type: other$/m);
  });

  it('empty-string summary is treated like NO_SUMMARY', async () => {
    mockBlob(BLOB_CONTENT);
    vi.mocked(generateText).mockResolvedValue({
      output: { summary: '   ', page_type: 'other' },
    } as any);

    const result = await summarizePage({
      generationId: 1,
      page: PAGE,
      siteName: 'Acme',
      maxInputBytes: 1_000_000,
    });

    expect(result.status).toBe('empty');
  });

  it('truncates the body when it exceeds maxInputBytes', async () => {
    const big = 'x'.repeat(50_000);
    mockBlob(
      'url: https://x.test/big\nsummary: \nupdated: 2026-05-14\n\n' + big,
    );
    vi.mocked(generateText).mockResolvedValue({
      output: { summary: 'A.', page_type: 'article' },
    } as any);

    await summarizePage({
      generationId: 1,
      page: { ...PAGE, url: 'https://x.test/big', path: 'big' },
      siteName: 'Acme',
      maxInputBytes: 100,
    });

    const promptArg = vi.mocked(generateText).mock.calls[0]?.[0]?.prompt as string;
    expect(promptArg).toContain('[truncated]');
    // The content section in the prompt should not contain the full 50k chars.
    const contentMatch = promptArg.length;
    expect(contentMatch).toBeLessThan(50_000);
  });

  it('returns failed and does NOT rewrite blob on model error', async () => {
    mockBlob(BLOB_CONTENT);
    vi.mocked(generateText).mockRejectedValue(new Error('gateway 502'));

    const result = await summarizePage({
      generationId: 1,
      page: PAGE,
      siteName: 'Acme',
      maxInputBytes: 1_000_000,
    });

    expect(result.status).toBe('failed');
    if (result.status === 'failed') {
      expect(result.reason).toMatch(/gateway 502/);
    }
    expect(put).not.toHaveBeenCalled();
  });

  it('returns failed when the blob cannot be loaded', async () => {
    vi.mocked(get).mockResolvedValue(null as any);

    const result = await summarizePage({
      generationId: 1,
      page: PAGE,
      siteName: 'Acme',
      maxInputBytes: 1_000_000,
    });

    expect(result.status).toBe('failed');
    expect(generateText).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });
});
