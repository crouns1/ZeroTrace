import cors from "cors";
import express from "express";
import { z } from "zod";
import { config } from "./config.js";
import { createJobRunner } from "./services/job-runner.js";
import { SearchService } from "./services/search-service.js";

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
const searchSchema = z.object({
  q: z.string().min(1),
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

app.listen(config.port, () => {
  console.log(`ReconPulse API listening on http://localhost:${config.port}`);
});
