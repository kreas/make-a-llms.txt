import { vi } from 'vitest';

export const blobStore = new Map<string, string>();

export function mockBlob() {
  blobStore.clear();
  return vi.mock('@vercel/blob', () => ({
    put: vi.fn(async (pathname: string, body: any) => {
      const text = typeof body === 'string' ? body : await readToString(body);
      blobStore.set(pathname, text);
      return {
        url: `https://blob.test/${pathname}`,
        pathname,
        contentType: 'text/plain',
        contentDisposition: '',
      };
    }),
    del: vi.fn(async (url: string) => {
      const path = url.replace('https://blob.test/', '');
      blobStore.delete(path);
    }),
    head: vi.fn(async (url: string) => ({
      url,
      pathname: url.replace('https://blob.test/', ''),
      size: blobStore.get(url.replace('https://blob.test/', ''))?.length ?? 0,
      contentType: 'text/plain',
    })),
    list: vi.fn(async () => ({ blobs: [...blobStore.keys()].map((p) => ({ pathname: p })) })),
  }));
}

async function readToString(body: any): Promise<string> {
  if (body instanceof ReadableStream) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let out = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      out += decoder.decode(value, { stream: true });
    }
    return out + decoder.decode();
  }
  if (body instanceof Uint8Array) return new TextDecoder().decode(body);
  if (Buffer.isBuffer(body)) return body.toString('utf8');
  return String(body);
}
