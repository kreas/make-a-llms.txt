import { execa } from 'execa';
import { put } from '@/lib/blob';
import { Readable, PassThrough } from 'node:stream';
import path from 'node:path';

// Next.js's file-tracer (nft) discovers function dependencies by walking
// static import/require references. We invoke the llmstxt CLI as a separate
// process (execa), so the tracer never sees its requires. The dynamic
// imports below are unreachable at runtime (the guard is impossible) but
// visible to the static analyzer, which walks the require chains and pulls
// the entire transitive dep tree (commander, cheerio, undici, sitemapper,
// turndown, ora, picomatch, replace-in-file, ...) into the function bundle.
async function _traceLlmstxtDeps(): Promise<void> {
  if ((globalThis as Record<string, unknown>).__nft_trace_anchor === Symbol.for('nft')) {
    // @ts-expect-error - llmstxt has no published type declarations
    await import('llmstxt/src/cli/llmstxt');
    // @ts-expect-error - llmstxt has no published type declarations
    await import('llmstxt/src/cli/actions/gen');
  }
}
void _traceLlmstxtDeps;

export type RunOpts = {
  subcommand: 'gen' | 'gen-full';
  sitemapUrl: string;
  blobPath: string;
  maxBytes: number;
};

export type RunResult = {
  blobPath: string;
  url: string;
  bytes: number;
};

// Point at the real JS entry (not the .bin/ symlink). The symlink can break
// across Vercel Function packaging; the script's shebang requires `node` on
// PATH which isn't guaranteed either. We invoke `process.execPath <entry>`
// directly. Resolved lazily — Next.js's bundler rewrites import.meta.url,
// so resolving at module-load time would crash during page-data collection.
function getBinEntry(): string {
  return path.resolve(process.cwd(), 'node_modules/llmstxt/src/cli/llmstxt.js');
}

export async function runLlmstxt(opts: RunOpts): Promise<RunResult> {
  const proc = execa(process.execPath, [getBinEntry(), opts.subcommand, opts.sitemapUrl], {
    buffer: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let procResult: { exitCode?: number; stdout: string; stderr: string };
  try {
    procResult = await proc;
  } catch (err: unknown) {
    const exit = err != null && typeof err === 'object' && 'exitCode' in err ? (err as { exitCode: unknown }).exitCode : 'unknown';
    const stderr = err != null && typeof err === 'object' && 'stderr' in err ? (err as { stderr: string }).stderr : '';
    const message = err instanceof Error ? err.message : '';
    const tail = (stderr || message).slice(-500);
    throw new Error(`llmstxt ${opts.subcommand} failed (exit code ${exit}): ${tail}`);
  }

  if (procResult.exitCode !== 0) {
    const tail = (procResult.stderr || '').slice(-500);
    throw new Error(
      `llmstxt ${opts.subcommand} failed (exit code ${procResult.exitCode}): ${tail}`,
    );
  }

  if (Buffer.byteLength(procResult.stdout) > opts.maxBytes) {
    throw new Error(`Output exceeded size limit (${opts.maxBytes} bytes).`);
  }

  // Upload to Vercel Blob
  const result = await put(opts.blobPath, procResult.stdout, {
    contentType: 'text/plain; charset=utf-8',
  });

  return { blobPath: opts.blobPath, url: result.url, bytes: Buffer.byteLength(procResult.stdout) };
}
