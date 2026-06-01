import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucket = process.env.R2_BUCKET_NAME || 'make-a-llms-txt';

// Lazily initialize client to avoid crashes if variables are missing during startup or test runs
let s3Client: S3Client | null = null;
function getS3Client() {
  if (!s3Client) {
    if (!accountId || !accessKeyId || !secretAccessKey) {
      throw new Error(
        'Cloudflare R2 credentials are not fully configured in environment variables.'
      );
    }
    s3Client = new S3Client({
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      region: 'auto',
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }
  return s3Client;
}

function cleanKey(urlOrPath: string): string {
  if (urlOrPath.startsWith('http://') || urlOrPath.startsWith('https://')) {
    try {
      const url = new URL(urlOrPath);
      // Remove leading slash
      return url.pathname.substring(1);
    } catch {
      // ignore
    }
  }
  return urlOrPath;
}

export async function put(
  pathname: string,
  body: string | Buffer | Uint8Array | ReadableStream,
  options?: { contentType?: string }
) {
  const client = getS3Client();
  const key = cleanKey(pathname);

  let finalBody: any = body;
  if (body instanceof ReadableStream) {
    finalBody = Readable.fromWeb(body as any);
  }

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: finalBody,
      ContentType: options?.contentType,
    })
  );

  const publicUrlPrefix = process.env.R2_PUBLIC_URL || `https://pub-r2.test`;
  return {
    url: `${publicUrlPrefix}/${key}`,
    pathname: key,
  };
}

export async function get(urlOrPath: string, _options?: any) {
  const client = getS3Client();
  const key = cleanKey(urlOrPath);

  const response = await client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );

  const bodyStream = response.Body;
  let webStream: ReadableStream | null = null;
  if (bodyStream) {
    if (typeof (bodyStream as any).transformToWebStream === 'function') {
      webStream = (bodyStream as any).transformToWebStream();
    } else if (bodyStream instanceof Readable) {
      webStream = Readable.toWeb(bodyStream);
    } else {
      webStream = bodyStream as any;
    }
  }

  return {
    stream: webStream,
  };
}

export async function del(urlOrPath: string | string[]) {
  const client = getS3Client();
  const keys = Array.isArray(urlOrPath) ? urlOrPath.map(cleanKey) : [cleanKey(urlOrPath)];

  for (const key of keys) {
    await client.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );
  }
}

export async function list(options?: { prefix?: string }) {
  const client = getS3Client();
  const prefix = options?.prefix ? cleanKey(options.prefix) : undefined;

  const response = await client.send(
    new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
    })
  );

  const blobs = (response.Contents ?? []).map((item) => ({
    pathname: item.Key || '',
  }));

  return { blobs };
}
