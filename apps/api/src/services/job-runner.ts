import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import type { ReconJob, ReconJobStatus, SearchResponse } from "../types.js";

type JobProcessor = (
  query: string,
  updateProgress: (progress: number, stage: string) => Promise<void> | void,
) => Promise<SearchResponse>;

export interface JobRunner {
  readonly name: string;
  enqueue(query: string): Promise<ReconJob>;
  get(jobId: string): Promise<ReconJob | undefined>;
}

interface MemoryJobRecord extends ReconJob {
  query: string;
}

class MemoryJobRunner implements JobRunner {
  readonly name = "memory-worker";
  private readonly jobs = new Map<string, MemoryJobRecord>();

  constructor(private readonly processor: JobProcessor) {}

  async enqueue(query: string): Promise<ReconJob> {
    const now = new Date().toISOString();
    const job: MemoryJobRecord = {
      id: randomUUID(),
      query,
      status: "queued",
      progress: 0,
      createdAt: now,
      updatedAt: now,
    };

    this.jobs.set(job.id, job);
    queueMicrotask(() => {
      void this.run(job.id);
    });
    return job;
  }

  async get(jobId: string): Promise<ReconJob | undefined> {
    return this.jobs.get(jobId);
  }

  private async run(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);

    if (!job) {
      return;
    }

    job.status = "running";
    job.updatedAt = new Date().toISOString();

    try {
      const result = await this.processor(job.query, async (progress, stage) => {
        job.progress = progress;
        job.currentStage = stage;
        job.updatedAt = new Date().toISOString();
      });

      job.status = "completed";
      job.progress = 100;
      job.currentStage = "Completed";
      job.result = result;
      job.updatedAt = new Date().toISOString();
    } catch (error) {
      job.status = "failed";
      job.error = error instanceof Error ? error.message : "Recon job failed.";
      job.updatedAt = new Date().toISOString();
    }
  }
}

class BullMqJobRunner implements JobRunner {
  readonly name = "bullmq";
  private readonly queue: Queue<{ query: string }>;
  private readonly worker: Worker<{ query: string }, SearchResponse>;

  constructor(redisUrl: string, processor: JobProcessor) {
    const connection = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
    });

    this.queue = new Queue<{ query: string }>("reconpulse-jobs", {
      connection,
      defaultJobOptions: {
        removeOnComplete: 50,
        removeOnFail: 50,
      },
    });
    this.worker = new Worker<{ query: string }, SearchResponse>(
      "reconpulse-jobs",
      async (job) =>
        processor(job.data.query, async (progress, stage) => {
          await job.updateProgress({
            progress,
            stage,
          });
        }),
      { connection },
    );
  }

  async enqueue(query: string): Promise<ReconJob> {
    const job = await this.queue.add("recon-run", { query });
    return {
      id: String(job.id),
      query,
      status: "queued",
      progress: 0,
      createdAt: new Date(job.timestamp).toISOString(),
      updatedAt: new Date(job.timestamp).toISOString(),
    };
  }

  async get(jobId: string): Promise<ReconJob | undefined> {
    const job = await this.queue.getJob(jobId);

    if (!job) {
      return undefined;
    }

    const state = await job.getState();
    const progressData =
      typeof job.progress === "object" && job.progress ? (job.progress as { progress?: number; stage?: string }) : {};

    return {
      id: String(job.id),
      query: job.data.query,
      status: mapBullMqStatus(state),
      progress:
        typeof job.progress === "number"
          ? job.progress
          : progressData.progress ?? (state === "completed" ? 100 : 0),
      currentStage: progressData.stage,
      createdAt: new Date(job.timestamp).toISOString(),
      updatedAt: new Date(job.finishedOn ?? job.processedOn ?? job.timestamp).toISOString(),
      result: job.returnvalue as SearchResponse | undefined,
      error: job.failedReason ?? undefined,
    };
  }
}

function mapBullMqStatus(state: string): ReconJobStatus {
  if (state === "completed") {
    return "completed";
  }

  if (state === "failed") {
    return "failed";
  }

  if (state === "active") {
    return "running";
  }

  return "queued";
}

export function createJobRunner(processor: JobProcessor): JobRunner {
  if (config.redisUrl) {
    return new BullMqJobRunner(config.redisUrl, processor);
  }

  return new MemoryJobRunner(processor);
}
