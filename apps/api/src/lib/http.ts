import { config } from "../config.js";

const defaultHeaders = {
  "User-Agent": "ZeroTrace/0.1",
};

export async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: defaultHeaders,
    signal: AbortSignal.timeout(config.requestTimeoutMs),
  });

  if (!response.ok) {
    throw new Error(`Request failed with ${response.status} for ${url}`);
  }

  return (await response.json()) as T;
}

export async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: defaultHeaders,
    signal: AbortSignal.timeout(config.requestTimeoutMs),
  });

  if (!response.ok) {
    throw new Error(`Request failed with ${response.status} for ${url}`);
  }

  return response.text();
}

