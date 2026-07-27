// Cloudflare R2 (S3-compatible) client for podcast audio.
// Audio lives in a PRIVATE R2 bucket; we mint short-lived presigned URLs for
// upload (PUT) and playback (GET). The DB only stores the object key.
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export function r2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET,
  );
}

let client: S3Client | undefined;
function r2(): S3Client {
  if (!client) {
    client = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID as string,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY as string,
      },
    });
  }
  return client;
}

const bucket = () => process.env.R2_BUCKET as string;

export function presignPutUrl(key: string, contentType: string, expiresIn = 600): Promise<string> {
  return getSignedUrl(
    r2(),
    new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType }),
    { expiresIn },
  );
}

export function presignGetUrl(key: string, expiresIn = 3600): Promise<string> {
  return getSignedUrl(r2(), new GetObjectCommand({ Bucket: bucket(), Key: key }), { expiresIn });
}

// ---------------------------------------------------------------------------
// Multipart upload
// ---------------------------------------------------------------------------
// A single presigned PUT sends a whole episode down one TCP connection, which
// is what made large uploads crawl. Splitting the file into parts lets the
// browser run several in parallel and retry just the part that failed.
//
// S3 requires every part except the last to be at least 5 MiB.
export const MIN_PART_SIZE = 5 * 1024 * 1024;
export const PART_SIZE = 8 * 1024 * 1024;
/** Below this, one PUT is faster than the multipart handshake. */
export const MULTIPART_THRESHOLD = PART_SIZE;

export interface MultipartStart {
  uploadId: string;
  /** Presigned PUT URL per part, in order. Part numbers are 1-based. */
  partUrls: string[];
  partSize: number;
}

export async function startMultipart(
  key: string,
  contentType: string,
  partCount: number,
  expiresIn = 3600,
): Promise<MultipartStart> {
  const client = r2();
  const created = await client.send(
    new CreateMultipartUploadCommand({ Bucket: bucket(), Key: key, ContentType: contentType }),
  );
  const uploadId = created.UploadId;
  if (!uploadId) throw new Error('R2 did not return an upload id');

  const partUrls = await Promise.all(
    Array.from({ length: partCount }, (_, i) =>
      getSignedUrl(
        client,
        new UploadPartCommand({
          Bucket: bucket(),
          Key: key,
          UploadId: uploadId,
          PartNumber: i + 1,
        }),
        { expiresIn },
      ),
    ),
  );

  return { uploadId, partUrls, partSize: PART_SIZE };
}

export async function completeMultipart(
  key: string,
  uploadId: string,
  parts: Array<{ partNumber: number; etag: string }>,
): Promise<void> {
  await r2().send(
    new CompleteMultipartUploadCommand({
      Bucket: bucket(),
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        // S3 rejects an out-of-order manifest, and the browser finishes parts
        // in whatever order the network allows.
        Parts: [...parts]
          .sort((a, b) => a.partNumber - b.partNumber)
          .map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
      },
    }),
  );
}

/** Releases the parts R2 is holding. Best-effort: failures here are not fatal. */
export async function abortMultipart(key: string, uploadId: string): Promise<void> {
  await r2().send(
    new AbortMultipartUploadCommand({ Bucket: bucket(), Key: key, UploadId: uploadId }),
  );
}
