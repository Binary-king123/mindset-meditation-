// Cloudflare R2 (S3-compatible) client for podcast audio.
// Audio lives in a PRIVATE R2 bucket; we mint short-lived presigned URLs for
// upload (PUT) and playback (GET). The DB only stores the object key.
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  GetObjectCommand,
  ListPartsCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
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
// S3 requires every part except the last to be at least 5 MiB, which the 8 MiB
// part size below satisfies with room to spare.
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

/**
 * The parts R2 is actually holding for this upload, asked of R2 directly.
 *
 * The browser sees an ETag on each part response too — but only when the
 * bucket's CORS policy lists ETag under ExposeHeaders. When it doesn't, the
 * header is silently stripped from the browser's view and the upload dies at
 * the very last step, after the entire file has already been transferred.
 * Listing server-side is authoritative and needs no bucket configuration, so
 * the upload works on a freshly created bucket.
 *
 * Paginated: S3 returns at most 1000 parts per page.
 */
async function listUploadedParts(
  key: string,
  uploadId: string,
): Promise<Array<{ PartNumber: number; ETag: string }>> {
  const parts: Array<{ PartNumber: number; ETag: string }> = [];
  let marker: string | undefined;

  do {
    const page = await r2().send(
      new ListPartsCommand({
        Bucket: bucket(),
        Key: key,
        UploadId: uploadId,
        PartNumberMarker: marker,
      }),
    );
    for (const part of page.Parts ?? []) {
      if (part.PartNumber && part.ETag) {
        parts.push({ PartNumber: part.PartNumber, ETag: part.ETag });
      }
    }
    marker = page.IsTruncated ? page.NextPartNumberMarker : undefined;
  } while (marker);

  // S3 rejects an out-of-order manifest, and parts finish in whatever order
  // the network allows.
  return parts.sort((a, b) => a.PartNumber - b.PartNumber);
}

export async function completeMultipart(key: string, uploadId: string): Promise<void> {
  const parts = await listUploadedParts(key, uploadId);
  if (parts.length === 0) {
    throw new Error('R2 is holding no parts for this upload — nothing to complete');
  }

  await r2().send(
    new CompleteMultipartUploadCommand({
      Bucket: bucket(),
      Key: key,
      UploadId: uploadId,
      MultipartUpload: { Parts: parts },
    }),
  );
}

/** Releases the parts R2 is holding. Best-effort: failures here are not fatal. */
export async function abortMultipart(key: string, uploadId: string): Promise<void> {
  await r2().send(
    new AbortMultipartUploadCommand({ Bucket: bucket(), Key: key, UploadId: uploadId }),
  );
}
