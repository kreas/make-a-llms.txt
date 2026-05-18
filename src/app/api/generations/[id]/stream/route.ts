import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { generations } from '@/db/schema';
import {
  apiErrorResponse,
  assertOwnsGenerationByUid,
  requireUserOrThrow,
} from '@/lib/auth-guards';

type Ctx = { params: Promise<{ id: string }> };

type Writer = { write: (s: string) => void; close: () => void };

const TERMINAL = new Set(['succeeded', 'failed', 'cancelled']);

export async function buildEventStream(
  generationId: number,
  userId: number,
  writer: Writer,
  opts: { intervalMs: number; heartbeatMs: number; idleTimeoutMs: number },
): Promise<void> {
  let lastSerialized = '';
  let lastEventAt = Date.now();

  const tick = async (): Promise<boolean> => {
    const [row] = await getDb()
      .select()
      .from(generations)
      .where(eq(generations.id, generationId));
    if (!row || row.userId !== userId) return true;

    const snapshot = JSON.stringify({
      status: row.status,
      llmsBlobPath: row.llmsBlobPath,
      llmsFullBlobPath: row.llmsFullBlobPath,
      errorMessage: row.errorMessage,
      pagesStatus: row.pagesStatus,
      pagesCount: row.pagesCount,
      pagesManifestBlobPath: row.pagesManifestBlobPath,
      pagesErrorMessage: row.pagesErrorMessage,
    });
    if (snapshot !== lastSerialized) {
      writer.write(`event: status\ndata: ${snapshot}\n\n`);
      lastSerialized = snapshot;
      lastEventAt = Date.now();
    }

    if (TERMINAL.has(row.status)) return true;
    return false;
  };

  let lastHeartbeat = Date.now();
  while (true) {
    const done = await tick();
    if (done) break;
    if (Date.now() - lastEventAt > opts.idleTimeoutMs) break;
    if (Date.now() - lastHeartbeat > opts.heartbeatMs) {
      writer.write(`: heartbeat\n\n`);
      lastHeartbeat = Date.now();
    }
    await new Promise((r) => setTimeout(r, opts.intervalMs));
  }
  writer.close();
}

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUserOrThrow();
    const { id } = await ctx.params;
    const gen = await assertOwnsGenerationByUid(id, user.id);

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const enc = new TextEncoder();
        const writer: Writer = {
          write: (s) => controller.enqueue(enc.encode(s)),
          close: () => controller.close(),
        };
        buildEventStream(gen.id, user.id, writer, {
          intervalMs: 1000,
          heartbeatMs: 15_000,
          idleTimeoutMs: 10 * 60_000,
        }).catch((err) => {
          console.error('[sse] buildEventStream failed', err);
          try { controller.error(err); } catch { /* already closed */ }
        });
      },
    });

    return new Response(stream, {
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
      },
    });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
