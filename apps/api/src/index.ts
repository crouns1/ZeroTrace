import cors from "cors";
import express from "express";
import { z } from "zod";
import { config } from "./config.js";
import { SearchService } from "./services/search-service.js";

const app = express();
const searchService = new SearchService();
const searchSchema = z.object({
  q: z.string().min(1),
});

app.use(cors({ origin: config.corsOrigin }));
app.use(express.json());

app.get("/health", (_request, response) => {
  response.json({
    ok: true,
    service: "zero-trace-api",
    timestamp: new Date().toISOString(),
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
    const result = await searchService.search(parsed.data.q);
    response.json(result);
  } catch (error) {
    response.status(502).json({
      error: error instanceof Error ? error.message : "Search failed.",
      disclaimer: config.disclaimer,
    });
  }
});

app.listen(config.port, () => {
  console.log(`Zero Trace API listening on http://localhost:${config.port}`);
});
