import type { ReconJob, SearchResponse, WatchTarget } from "./types";

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

export async function listWatchTargets(): Promise<WatchTarget[]> {
  const response = await fetch("/api/watch-targets");
  const payload = (await response.json()) as WatchTarget[] | { error?: string };

  if (!response.ok) {
    throw new Error("error" in payload && payload.error ? payload.error : "Could not load watch targets.");
  }

  return payload as WatchTarget[];
}

export async function createWatchTarget(query: string, label?: string): Promise<WatchTarget> {
  const response = await fetch("/api/watch-targets", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      q: query,
      ...(label ? { label } : {}),
    }),
  });
  const payload = (await response.json()) as WatchTarget | { error?: string };

  if (!response.ok) {
    throw new Error("error" in payload && payload.error ? payload.error : "Could not create watch target.");
  }

  return payload as WatchTarget;
}

export async function runWatchCheck(watchId: string): Promise<WatchTarget> {
  const response = await fetch(`/api/watch-targets/${encodeURIComponent(watchId)}/check`, {
    method: "POST",
  });
  const payload = (await response.json()) as WatchTarget | { error?: string };

  if (!response.ok) {
    throw new Error("error" in payload && payload.error ? payload.error : "Could not run watch check.");
  }

  return payload as WatchTarget;
}

export async function deleteWatchTarget(watchId: string): Promise<void> {
  const response = await fetch(`/api/watch-targets/${encodeURIComponent(watchId)}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const payload = (await response.json()) as { error?: string };
    throw new Error(payload.error ?? "Could not delete watch target.");
  }
}
