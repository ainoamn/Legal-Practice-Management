import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";
export abstract class DocumentStorage {
  abstract configured(): boolean;
  abstract put(key: string, body: Buffer, mime: string): Promise<void>;
  abstract get(key: string): Promise<Buffer>;
  abstract remove(key: string): Promise<void>;
  abstract health(): Promise<void>;
}
@Injectable()
export class S3DocumentStorage extends DocumentStorage {
  private client?: S3Client;
  configured() {
    return Boolean(
      process.env.S3_BUCKET &&
      process.env.S3_REGION &&
      process.env.S3_ACCESS_KEY_ID &&
      process.env.S3_SECRET_ACCESS_KEY,
    );
  }
  private connection() {
    if (!this.configured())
      throw new ServiceUnavailableException("DOCUMENT_STORAGE_UNAVAILABLE");
    return (this.client ??= new S3Client({
      region: process.env.S3_REGION,
      endpoint: process.env.S3_ENDPOINT || undefined,
      forcePathStyle: Boolean(process.env.S3_ENDPOINT),
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID!,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
      },
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
        requestHandler: { connectionTimeout: 5000, requestTimeout: 30000 },
        maxAttempts: 3,
    }));
  }
  async put(key: string, body: Buffer, mime: string) {
    await this.connection().send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET!,
        Key: key,
        Body: body,
        ContentType: mime,
        ...(process.env.S3_SERVER_SIDE_ENCRYPTION
          ? { ServerSideEncryption: "AES256" as const }
          : {}),
      }),
    );
  }
  async get(key: string) {
    const response = await this.connection().send(
      new GetObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: key }),
    );
    if (!response.Body)
      throw new ServiceUnavailableException("OBJECT_UNAVAILABLE");
    return Buffer.from(await response.Body.transformToByteArray());
  }
  async remove(key: string) {
    await this.connection().send(
      new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: key }),
    );
  }
  async health() {
    await this.connection().send(
      new HeadBucketCommand({ Bucket: process.env.S3_BUCKET! }),
    );
  }
}
