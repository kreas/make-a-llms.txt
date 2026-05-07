import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Readable } from 'node:stream';
import { runLlmstxt } from './llmstxt';

vi.mock('execa', () => {
  return {
    execa: vi.fn(),
  };
});

vi.mock('@vercel/blob', () => ({
  put: vi.fn(async (pathname: string, body: any) => ({
    url: `https://blob.test/${pathname}`,
    pathname,
  })),
}));

import { execa } from 'execa';
import { put } from '@vercel/blob';

function fakeProc(stdout: string, exitCode = 0, stderr = '') {
  const stream = Readable.from([Buffer.from(stdout)]);
  const promise: any = Promise.resolve({ stdout, stderr, exitCode });
  promise.stdout = stream;
  promise.stderr = Readable.from([Buffer.from(stderr)]);
  return promise;
}

describe('runLlmstxt', () => {
  beforeEach(() => {
    vi.mocked(execa).mockReset();
    vi.mocked(put).mockClear();
  });

  it('runs gen and uploads stdout to the given blob path', async () => {
    vi.mocked(execa).mockReturnValue(fakeProc('# llms.txt\n- a\n- b\n'));
    const out = await runLlmstxt({
      subcommand: 'gen',
      sitemapUrl: 'https://x.test/sitemap.xml',
      blobPath: 'gens/1/llms.txt',
      maxBytes: 1024,
    });
    expect(out.blobPath).toBe('gens/1/llms.txt');
    expect(vi.mocked(put)).toHaveBeenCalledTimes(1);
  });

  it('throws on non-zero exit code with truncated stderr', async () => {
    vi.mocked(execa).mockReturnValue(fakeProc('', 1, 'bad sitemap'));
    await expect(
      runLlmstxt({
        subcommand: 'gen',
        sitemapUrl: 'https://x.test/sitemap.xml',
        blobPath: 'gens/2/llms.txt',
        maxBytes: 1024,
      }),
    ).rejects.toThrow(/bad sitemap|exit code 1/);
  });

  it('throws when stdout exceeds maxBytes', async () => {
    vi.mocked(execa).mockReturnValue(fakeProc('x'.repeat(2000)));
    await expect(
      runLlmstxt({
        subcommand: 'gen-full',
        sitemapUrl: 'https://x.test/sitemap.xml',
        blobPath: 'gens/3/llms-full.txt',
        maxBytes: 100,
      }),
    ).rejects.toThrow(/size limit/i);
  });
});
