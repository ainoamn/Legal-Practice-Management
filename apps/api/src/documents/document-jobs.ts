import {
  Injectable,
  Inject,
  type OnModuleInit,
  type OnModuleDestroy,
} from "@nestjs/common";
import { Queue, Worker } from "bullmq";
import { db, inTenant } from "../../../../packages/database/src/index.js";
import { DocumentsService } from "./documents.service.js";
type JobData = { tenantId: string; versionId: string; memberId: string };
export const DOCUMENT_WORKER_ENABLED = "DOCUMENT_WORKER_ENABLED";
@Injectable()
export class DocumentJobs implements OnModuleInit, OnModuleDestroy {
  private queue?: Queue<JobData>;
  private worker?: Worker<JobData>;
  private timer?: ReturnType<typeof setInterval>;
  constructor(
    @Inject(DocumentsService) private readonly documents: DocumentsService,
    @Inject(DOCUMENT_WORKER_ENABLED) private readonly enabled: boolean,
  ) {}
  onModuleInit() {
    if (!this.enabled || !this.documents.storage.configured()) return;
    if (!process.env.REDIS_URL) return;
    const url = new URL(process.env.REDIS_URL!);
    const connection = {
      host: url.hostname,
      port: Number(url.port || 6379),
      username: url.username ? decodeURIComponent(url.username) : undefined,
      password: url.password ? decodeURIComponent(url.password) : undefined,
      db: Number(url.pathname.slice(1) || 0),
      ...(url.protocol === "rediss:" ? { tls: {} } : {}),
    };
    this.queue = new Queue<JobData>("legal-documents", {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 10000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 200 },
      },
    });
    this.worker = new Worker<JobData>(
      "legal-documents",
      async (job) => {
        const data = job.data;
        const membership = await inTenant(data.tenantId, (tx) =>
          tx.membership.findFirst({
            where: { id: data.memberId, active: true },
          }),
        );
        if (!membership) throw new Error("UPLOADER_ACCESS_REVOKED");
        await this.documents.process(
          {
            tenantId: data.tenantId,
            membershipId: membership.id,
            userId: membership.userId,
            sessionId: "background-document-job",
          },
          data.versionId,
        );
      },
      { connection, concurrency: 2, lockDuration: 600000 },
    );
    this.worker.on("error", () => console.error("DOCUMENT_QUEUE_UNAVAILABLE"));
    this.timer = setInterval(() => {
      void this.reconcile().catch(() =>
        console.error("DOCUMENT_RECONCILIATION_FAILED"),
      );
    }, 30000);
    this.timer.unref();
    void this.reconcile().catch(() =>
      console.error("DOCUMENT_RECONCILIATION_FAILED"),
    );
  }
  async enqueue(data: JobData) {
    if (!this.queue) return;
    const existing = await this.queue.getJob(data.versionId);
    if (existing) {
      const state = await existing.getState();
      if (state === "failed") {
        await existing.updateData(data);
        await existing.retry();
        return;
      }
      if (state !== "completed") return;
      await existing.remove();
    }
    await this.queue.add("inspect", data, { jobId: data.versionId });
  }
  private async reconcile() {
    // Durable DB metadata closes the gap between committed uploads and Redis enqueue.
    const jobs = await db.$queryRaw<
      JobData[]
    >`SELECT * FROM document_pending_jobs()`;
    for (const job of jobs) await this.enqueue(job);
  }
  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.worker?.close();
    await this.queue?.close();
  }
}
