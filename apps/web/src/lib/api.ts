import type { SearchResponse } from "./types";

export async function searchQuery(query: string): Promise<SearchResponse> {
  const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
  const payload = (await response.json()) as SearchResponse | { error?: string };

  if (!response.ok) {
    throw new Error("error" in payload && payload.error ? payload.error : "Search failed.");
  }

  return payload as SearchResponse;
}

