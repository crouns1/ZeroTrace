import { config } from "../config.js";
import { assertSafeOutboundUrl } from "./network.js";

const defaultHeaders = {
  "User-Agent": "ReconPulse/0.2",
};

export interface PageFetchResult {
  finalUrl: string;
  headers: Record<string, string>;
  status: number;
  text: string;
}

function isRedirectStatus(status: number): boolean {
  return [301, 302, 303, 307, 308].includes(status);
}

function mergeHeaders(headers?: HeadersInit): HeadersInit {
  return {
    ...defaultHeaders,
    ...(headers ?? {}),
  };
}

async function fetchWithDefaults(url: string | URL, init: RequestInit = {}, redirectCount = 0): Promise<Response> {
  const safeUrl = await assertSafeOutboundUrl(url);
  const method = (init.method ?? "GET").toUpperCase();
  const response = await fetch(safeUrl, {
    ...init,
    headers: mergeHeaders(init.headers),
    redirect: "manual",
    signal: init.signal ?? AbortSignal.timeout(config.requestTimeoutMs),
  });

  if (
    isRedirectStatus(response.status) &&
    response.headers.get("location") &&
    method !== "POST" &&
    redirectCount < config.outboundMaxRedirects
  ) {
    const nextUrl = new URL(response.headers.get("location") ?? "", safeUrl);
    return fetchWithDefaults(nextUrl, init, redirectCount + 1);
  }

  if (isRedirectStatus(response.status) && redirectCount >= config.outboundMaxRedirects) {
    throw new Error(`Too many outbound redirects for ${safeUrl.toString()}`);
  }

  return response;
}

export async function fetchJson<T>(url: string | URL, init?: RequestInit): Promise<T> {
  const response = await fetchWithDefaults(url, init);

  if (!response.ok) {
    throw new Error(`Request failed with ${response.status} for ${url}`);
  }

  return (await response.json()) as T;
}

export async function fetchText(url: string | URL, init?: RequestInit): Promise<string> {
  const response = await fetchWithDefaults(url, init);

  if (!response.ok) {
    throw new Error(`Request failed with ${response.status} for ${url}`);
  }

  return response.text();
}

export async function fetchPage(url: string | URL, init?: RequestInit): Promise<PageFetchResult> {
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

export async function postJson(url: string | URL, body: unknown, init?: RequestInit): Promise<Response> {
  return fetchWithDefaults(url, {
    ...init,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    body: JSON.stringify(body),
  });
}
