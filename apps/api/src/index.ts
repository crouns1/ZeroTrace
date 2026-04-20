import { randomUUID } from "node:crypto";
import cors from "cors";
import express from "express";
import { z } from "zod";
import { config } from "./config.js";
import { AuditLogger } from "./lib/audit-log.js";
import { authSummary, createAuthMiddleware } from "./lib/auth.js";
import { createRateLimitMiddleware } from "./lib/rate-limit.js";
import { createJobRunner } from "./services/job-runner.js";
import { SearchService } from "./services/search-service.js";
import { WatchService } from "./services/watch-service.js";

const app = express();
app.set("trust proxy", true);
const searchService = new SearchService();
const auditLogger = new AuditLogger();
let jobProviderName = "memory-worker";
const jobRunner = createJobRunner((query, updateProgress) =>
  searchService.search(query, {
    jobProviderName,
    mode: "job",
    onProgress: updateProgress,
  }),
);
jobProviderName = jobRunner.name;
const watchService = new WatchService(searchService, "watch-monitor");
const searchSchema = z.object({
  q: z.string().min(1),
});
const watchCreateSchema = z.object({
  q: z.string().min(1),
  label: z.string().trim().min(1).max(80).optional(),
});

function paramValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

const authMiddleware = createAuthMiddleware((request, response, reason) => {
  void auditLogger.record({
    level: "warn",
    event: "auth.failure",
    requestId: response.locals.requestId as string | undefined,
    ip: request.ip,
    method: request.method,
    path: request.originalUrl,
    statusCode: 401,
    detail: reason,
  });
});
const searchRateLimiter = createRateLimitMiddleware({
  keyPrefix: "search",
  limit: config.rateLimitSearchMax,
  onReject: (request, response, remainingMs) => {
    void auditLogger.record({
      level: "warn",
      event: "rate_limit.search",
      requestId: response.locals.requestId as string | undefined,
      actor: response.locals.authenticatedActor as string | undefined,
      ip: request.ip,
      method: request.method,
      path: request.originalUrl,
      statusCode: 429,
      detail: `Search rate limit exceeded for ${Math.ceil(remainingMs / 1000)} seconds`,
    });
  },
});
const mutationRateLimiter = createRateLimitMiddleware({
  keyPrefix: "mutation",
  limit: config.rateLimitMutationMax,
  onReject: (request, response, remainingMs) => {
    void auditLogger.record({
      level: "warn",
      event: "rate_limit.mutation",
      requestId: response.locals.requestId as string | undefined,
      actor: response.locals.authenticatedActor as string | undefined,
      ip: request.ip,
      method: request.method,
      path: request.originalUrl,
      statusCode: 429,
      detail: `Mutation rate limit exceeded for ${Math.ceil(remainingMs / 1000)} seconds`,
    });
  },
});

app.use(cors({
  origin(origin, callback) {
    if (!origin || config.corsOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error("Origin not allowed by CORS"));
  },
}));
app.use(express.json({ limit: "256kb" }));
app.use((request, response, next) => {
  response.locals.requestId = randomUUID();
  response.setHeader("X-Request-Id", response.locals.requestId);
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  response.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  auditLogger.bindRequestLifecycle(request, response);
  next();
});

app.get("/health", async (_request, response) => {
  response.json({
    ok: true,
    service: "reconpulse-api",
    timestamp: new Date().toISOString(),
    performance: {
      cacheProvider: searchService.getCacheProviderName(),
      jobProvider: jobRunner.name,
    },
    monitoring: await watchService.getSummary(),
    security: {
      auth: authSummary(),
      corsOrigins: config.corsOrigins,
      rateLimitWindowMs: config.rateLimitWindowMs,
      rateLimitSearchMax: config.rateLimitSearchMax,
      rateLimitMutationMax: config.rateLimitMutationMax,
    },
  });
});

app.get("/api/search", authMiddleware, searchRateLimiter, async (request, response) => {
  const parsed = searchSchema.safeParse(request.query);

  if (!parsed.success) {
    response.status(400).json({
      error: "Invalid search query.",
    });
    return;
  }

  try {
    const result = await searchService.search(parsed.data.q, {
      jobProviderName: jobRunner.name,
      mode: "sync",
    });
    void auditLogger.record({
      level: "info",
      event: "search.execute",
      requestId: response.locals.requestId as string | undefined,
      actor: response.locals.authenticatedActor as string | undefined,
      ip: request.ip,
      method: request.method,
      path: request.originalUrl,
      statusCode: 200,
      meta: {
        query: parsed.data.q,
        sourceCount: result.sources.length,
        insightCount: result.stats.insightCount,
      },
    });
    response.json(result);
  } catch (error) {
    response.status(502).json({
      error: error instanceof Error ? error.message : "Search failed.",
      disclaimer: config.disclaimer,
    });
  }
});

app.post("/api/recon/jobs", authMiddleware, mutationRateLimiter, async (request, response) => {
  const parsed = searchSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({
      error: "Invalid recon query.",
    });
    return;
  }

  try {
    const job = await jobRunner.enqueue(parsed.data.q);
    void auditLogger.record({
      level: "info",
      event: "job.enqueue",
      requestId: response.locals.requestId as string | undefined,
      actor: response.locals.authenticatedActor as string | undefined,
      ip: request.ip,
      method: request.method,
      path: request.originalUrl,
      statusCode: 202,
      meta: {
        query: parsed.data.q,
        jobId: job.id,
      },
    });
    response.status(202).json(job);
  } catch (error) {
    response.status(502).json({
      error: error instanceof Error ? error.message : "Could not start recon job.",
      disclaimer: config.disclaimer,
    });
  }
});

app.get("/api/recon/jobs/:jobId", authMiddleware, searchRateLimiter, async (request, response) => {
  const jobId = paramValue(request.params.jobId);
  const job = await jobRunner.get(jobId);

  if (!job) {
    response.status(404).json({
      error: "Recon job not found.",
    });
    return;
  }

  response.json(job);
});

app.get("/api/watch-targets", authMiddleware, searchRateLimiter, async (_request, response) => {
  response.json(await watchService.list());
});

app.post("/api/watch-targets", authMiddleware, mutationRateLimiter, async (request, response) => {
  const parsed = watchCreateSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({
      error: "Invalid watch target payload.",
    });
    return;
  }

  try {
    const target = await watchService.create(parsed.data.q, parsed.data.label);
    void auditLogger.record({
      level: "info",
      event: "watch.create",
      requestId: response.locals.requestId as string | undefined,
      actor: response.locals.authenticatedActor as string | undefined,
      ip: request.ip,
      method: request.method,
      path: request.originalUrl,
      statusCode: 201,
      meta: {
        watchId: target.id,
        query: target.query,
      },
    });
    response.status(201).json(target);
  } catch (error) {
    response.status(502).json({
      error: error instanceof Error ? error.message : "Could not create watch target.",
      disclaimer: config.disclaimer,
    });
  }
});

app.get("/api/watch-targets/:watchId", authMiddleware, searchRateLimiter, async (request, response) => {
  const watchId = paramValue(request.params.watchId);
  const target = await watchService.get(watchId);

  if (!target) {
    response.status(404).json({
      error: "Watch target not found.",
    });
    return;
  }

  response.json(target);
});

app.post("/api/watch-targets/:watchId/check", authMiddleware, mutationRateLimiter, async (request, response) => {
  const watchId = paramValue(request.params.watchId);
  const target = await watchService.get(watchId);

  if (!target) {
    response.status(404).json({
      error: "Watch target not found.",
    });
    return;
  }

  try {
    const updated = await watchService.runCheck(watchId);
    void auditLogger.record({
      level: "info",
      event: "watch.check",
      requestId: response.locals.requestId as string | undefined,
      actor: response.locals.authenticatedActor as string | undefined,
      ip: request.ip,
      method: request.method,
      path: request.originalUrl,
      statusCode: 200,
      meta: {
        watchId: updated.id,
        changeCount: updated.latestSnapshot?.changeCount ?? 0,
      },
    });
    response.json(updated);
  } catch (error) {
    response.status(502).json({
      error: error instanceof Error ? error.message : "Could not run watch check.",
      disclaimer: config.disclaimer,
    });
  }
});

app.delete("/api/watch-targets/:watchId", authMiddleware, mutationRateLimiter, async (request, response) => {
  const watchId = paramValue(request.params.watchId);
  const deleted = await watchService.delete(watchId);

  if (!deleted) {
    response.status(404).json({
      error: "Watch target not found.",
    });
    return;
  }

  void auditLogger.record({
    level: "info",
    event: "watch.delete",
    requestId: response.locals.requestId as string | undefined,
    actor: response.locals.authenticatedActor as string | undefined,
    ip: request.ip,
    method: request.method,
      path: request.originalUrl,
      statusCode: 204,
      meta: {
        watchId,
      },
    });
  response.status(204).send();
});

app.listen(config.port, () => {
  console.log(`ReconPulse API listening on http://localhost:${config.port}`);
});
