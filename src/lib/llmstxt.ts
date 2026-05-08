import { execa } from 'execa';
import { put } from '@vercel/blob';
import { Readable, PassThrough } from 'node:stream';
import path from 'node:path';

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
    buffer: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderrChunks = '';
  proc.stderr?.on('data', (c) => {
    stderrChunks += c.toString();
    if (stderrChunks.length > 4096) stderrChunks = stderrChunks.slice(-4096);
  });

  const { stream: guarded, done: guardDone, getError, getBytes } = guardSize(proc.stdout!, opts.maxBytes);

  const webStream = Readable.toWeb(guarded) as unknown as ReadableStream;
  const upload = put(opts.blobPath, webStream, {
    access: 'private',
    contentType: 'text/plain; charset=utf-8',
    addRandomSuffix: false,
  });

  let result: { url: string; pathname: string };
  let procResult: { exitCode?: number; stderr?: string };
  try {
    [result, procResult] = (await Promise.all([upload, proc, guardDone])) as [
      typeof result,
      typeof procResult,
      void,
    ];
  } catch (err: unknown) {
    const guardErr = getError();
    if (guardErr) throw guardErr;
    const exit = err != null && typeof err === 'object' && 'exitCode' in err ? (err as { exitCode: unknown }).exitCode : 'unknown';
    const message = err instanceof Error ? err.message : '';
    const tail = (stderrChunks || message).slice(-500);
    throw new Error(`llmstxt ${opts.subcommand} failed (exit code ${exit}): ${tail}`);
  }

  const guardErr = getError();
  if (guardErr) throw guardErr;

  if (procResult.exitCode !== 0) {
    const tail = (stderrChunks || procResult.stderr || '').slice(-500);
    throw new Error(
      `llmstxt ${opts.subcommand} failed (exit code ${procResult.exitCode}): ${tail}`,
    );
  }

  return { blobPath: opts.blobPath, url: result.url, bytes: getBytes() };
}

function guardSize(input: NodeJS.ReadableStream, maxBytes: number) {
  const out = new PassThrough();
  let bytes = 0;
  let error: Error | null = null;

  // We pipe manually so we can intercept data events for size counting
  input.on('data', (chunk: Buffer) => {
    bytes += chunk.length;
    if (bytes > maxBytes) {
      error = new Error(`Output exceeded size limit (${maxBytes} bytes).`);
      out.destroy(error);
      // NodeJS.ReadableStream may be a Readable (which has destroy); narrow the type to call it.
      (input as { destroy?: () => void }).destroy?.();
      return;
    }
    out.write(chunk);
  });
  input.on('end', () => out.end());
  input.on('error', (e) => out.destroy(e));

  // done resolves when the PassThrough stream finishes (or rejects on destroy)
  const done = new Promise<void>((resolve, reject) => {
    out.on('finish', resolve);
    out.on('close', () => {
      if (error) reject(error);
      else resolve();
    });
    out.on('error', (e) => {
      error = e as Error;
      reject(e);
    });
  });

  // Also drain the source stream in case nobody else consumes it (e.g. mocked put)
  out.resume();

  return {
    stream: out,
    done,
    getError: () => error,
    getBytes: () => bytes,
  };
}
