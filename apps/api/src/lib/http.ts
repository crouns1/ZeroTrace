import { config } from "../config.js";

const defaultHeaders = {
  "User-Agent": "ReconPulse/0.2",
};

export interface PageFetchResult {
  finalUrl: string;
  headers: Record<string, string>;
  status: number;
  text: string;
}

async function fetchWithDefaults(url: string): Promise<Response> {
  return fetch(url, {
    headers: defaultHeaders,
    redirect: "follow",
    signal: AbortSignal.timeout(config.requestTimeoutMs),
  });
}

export async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetchWithDefaults(url);

  if (!response.ok) {
    throw new Error(`Request failed with ${response.status} for ${url}`);
  }

  return (await response.json()) as T;
}

export async function fetchText(url: string): Promise<string> {
  const response = await fetchWithDefaults(url);

  if (!response.ok) {
    throw new Error(`Request failed with ${response.status} for ${url}`);
  }

  return response.text();
}

export async function fetchPage(url: string): Promise<PageFetchResult> {
  const response = await fetchWithDefaults(url);

  if (!response.ok) {
    throw new Error(`Request failed with ${response.status} for ${url}`);
  }

  const headers = Object.fromEntries(response.headers.entries());

  return {
    finalUrl: response.url,
    headers,
    status: response.status,
    text: await response.text(),
  };
}
