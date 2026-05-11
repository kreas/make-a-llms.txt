import { put, del, list, head, type PutBlobResult } from '@vercel/blob';

type BlobBody = string | Blob | ArrayBuffer | Buffer | ReadableStream;

export async function uploadFile(
  pathname: string,
  body: BlobBody,
  options?: { contentType?: string; access?: 'public' | 'private' },
): Promise<PutBlobResult> {
  return put(pathname, body, {
    access: options?.access ?? 'public',
    contentType: options?.contentType,
  });
}

export async function deleteFile(url: string) {
  await del(url);
}

export async function listFiles(prefix?: string) {
  return list({ prefix });
}

export async function getFileMetadata(url: string) {
  return head(url);
}
