import cors from "cors";
import express from "express";
import { z } from "zod";
import { config } from "./config.js";
import { createJobRunner } from "./services/job-runner.js";
import { SearchService } from "./services/search-service.js";
import { WatchService } from "./services/watch-service.js";

const app = express();
const searchService = new SearchService();
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

app.use(cors({ origin: config.corsOrigin }));
app.use(express.json());

app.get("/health", (_request, response) => {
  response.json({
    ok: true,
    service: "reconpulse-api",
    timestamp: new Date().toISOString(),
    performance: {
      cacheProvider: searchService.getCacheProviderName(),
      jobProvider: jobRunner.name,
    },
    monitoring: watchService.getSummary(),
  });
});

app.get("/api/search", async (request, response) => {
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
    response.json(result);
  } catch (error) {
    response.status(502).json({
      error: error instanceof Error ? error.message : "Search failed.",
      disclaimer: config.disclaimer,
    });
  }
});

app.post("/api/recon/jobs", async (request, response) => {
  const parsed = searchSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({
      error: "Invalid recon query.",
    });
    return;
  }

  try {
    const job = await jobRunner.enqueue(parsed.data.q);
    response.status(202).json(job);
  } catch (error) {
    response.status(502).json({
      error: error instanceof Error ? error.message : "Could not start recon job.",
      disclaimer: config.disclaimer,
    });
  }
});

app.get("/api/recon/jobs/:jobId", async (request, response) => {
  const job = await jobRunner.get(request.params.jobId);

  if (!job) {
    response.status(404).json({
      error: "Recon job not found.",
    });
    return;
  }

  response.json(job);
});

app.get("/api/watch-targets", (_request, response) => {
  response.json(watchService.list());
});

app.post("/api/watch-targets", async (request, response) => {
  const parsed = watchCreateSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({
      error: "Invalid watch target payload.",
    });
    return;
  }

  try {
    const target = await watchService.create(parsed.data.q, parsed.data.label);
    response.status(201).json(target);
  } catch (error) {
    response.status(502).json({
      error: error instanceof Error ? error.message : "Could not create watch target.",
      disclaimer: config.disclaimer,
    });
  }
});

app.get("/api/watch-targets/:watchId", (request, response) => {
  const target = watchService.get(request.params.watchId);

  if (!target) {
    response.status(404).json({
      error: "Watch target not found.",
    });
    return;
  }

  response.json(target);
});

app.post("/api/watch-targets/:watchId/check", async (request, response) => {
  const target = watchService.get(request.params.watchId);

  if (!target) {
    response.status(404).json({
      error: "Watch target not found.",
    });
    return;
  }

  try {
    const updated = await watchService.runCheck(request.params.watchId);
    response.json(updated);
  } catch (error) {
    response.status(502).json({
      error: error instanceof Error ? error.message : "Could not run watch check.",
      disclaimer: config.disclaimer,
    });
  }
});

app.delete("/api/watch-targets/:watchId", (request, response) => {
  const deleted = watchService.delete(request.params.watchId);

  if (!deleted) {
    response.status(404).json({
      error: "Watch target not found.",
    });
    return;
  }

  response.status(204).send();
});

app.listen(config.port, () => {
  console.log(`ReconPulse API listening on http://localhost:${config.port}`);
});
