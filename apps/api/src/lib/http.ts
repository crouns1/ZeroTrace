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

function mergeHeaders(headers?: HeadersInit): HeadersInit {
  return {
    ...defaultHeaders,
    ...(headers ?? {}),
  };
}

async function fetchWithDefaults(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: mergeHeaders(init.headers),
    redirect: "follow",
    signal: init.signal ?? AbortSignal.timeout(config.requestTimeoutMs),
  });
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetchWithDefaults(url, init);

  if (!response.ok) {
    throw new Error(`Request failed with ${response.status} for ${url}`);
  }

  return (await response.json()) as T;
}

export async function fetchText(url: string, init?: RequestInit): Promise<string> {
  const response = await fetchWithDefaults(url, init);

  if (!response.ok) {
    throw new Error(`Request failed with ${response.status} for ${url}`);
  }

  return response.text();
}

export async function fetchPage(url: string, init?: RequestInit): Promise<PageFetchResult> {
  const response = await fetchWithDefaults(url, init);

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
