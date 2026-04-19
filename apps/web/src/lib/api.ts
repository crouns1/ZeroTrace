import type { ReconJob, SearchResponse } from "./types";

export async function searchQuery(query: string): Promise<SearchResponse> {
  const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
  const payload = (await response.json()) as SearchResponse | { error?: string };

  if (!response.ok) {
    throw new Error("error" in payload && payload.error ? payload.error : "Search failed.");
  }

  return payload as SearchResponse;
}

export async function startReconJob(query: string): Promise<ReconJob> {
  const response = await fetch("/api/recon/jobs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ q: query }),
  });
  const payload = (await response.json()) as ReconJob | { error?: string };

  if (!response.ok) {
    throw new Error("error" in payload && payload.error ? payload.error : "Could not start recon job.");
  }

  return payload as ReconJob;
}

export async function getReconJob(jobId: string): Promise<ReconJob> {
  const response = await fetch(`/api/recon/jobs/${encodeURIComponent(jobId)}`);
  const payload = (await response.json()) as ReconJob | { error?: string };

  if (!response.ok) {
    throw new Error("error" in payload && payload.error ? payload.error : "Could not load recon job.");
  }

  return payload as ReconJob;
}
