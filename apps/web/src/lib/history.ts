import type { HistoryEntry, SearchResponse } from "./types";

const STORAGE_KEY = "zero-trace-history";
const MAX_HISTORY_ITEMS = 10;

export function loadHistory(): HistoryEntry[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored ? (JSON.parse(stored) as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

export function saveHistory(query: string, result: SearchResponse): HistoryEntry[] {
  const nextEntry: HistoryEntry = {
    query,
    searchedAt: new Date().toISOString(),
    stats: result.stats,
  };

  const nextHistory = [nextEntry, ...loadHistory().filter((item) => item.query !== query)].slice(
    0,
    MAX_HISTORY_ITEMS,
  );

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextHistory));
  return nextHistory;
}

