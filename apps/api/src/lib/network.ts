import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { config } from "../config.js";

interface DnsCacheEntry {
  expiresAt: number;
  safe: boolean;
}

const dnsSafetyCache = new Map<string, DnsCacheEntry>();
const blockedHostnames = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata",
  "metadata.google.internal",
  "host.docker.internal",
]);

function isPrivateIpv4(address: string): boolean {
  const octets = address.split(".").map((value) => Number(value));

  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
    return true;
  }

  const [first, second] = octets;

  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 224
  );
}

function isPrivateIpv6(address: string): boolean {
  const normalized = address.toLowerCase();

  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb") ||
    normalized.startsWith("::ffff:127.") ||
    normalized.startsWith("::ffff:10.") ||
    normalized.startsWith("::ffff:192.168.") ||
    normalized.startsWith("::ffff:172.")
  );
}

export function isPrivateIp(address: string): boolean {
  const family = isIP(address);

  if (family === 4) {
    return isPrivateIpv4(address);
  }

  if (family === 6) {
    return isPrivateIpv6(address);
  }

  return true;
}

export function isInternalHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");

  return (
    blockedHostnames.has(normalized) ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal") ||
    normalized.endsWith(".home")
  );
}

async function isSafeResolvedHostname(hostname: string): Promise<boolean> {
  const cacheKey = hostname.toLowerCase();
  const cached = dnsSafetyCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.safe;
  }

  try {
    const results = await lookup(hostname, { all: true, verbatim: true });
    const safe = results.length > 0 && results.every((entry) => !isPrivateIp(entry.address));
    dnsSafetyCache.set(cacheKey, {
      safe,
      expiresAt: Date.now() + config.outboundDnsCacheMs,
    });
    return safe;
  } catch {
    dnsSafetyCache.set(cacheKey, {
      safe: false,
      expiresAt: Date.now() + Math.min(config.outboundDnsCacheMs, 30_000),
    });
    return false;
  }
}

export async function assertSafeOutboundUrl(candidate: string | URL): Promise<URL> {
  const url = candidate instanceof URL ? new URL(candidate.toString()) : new URL(candidate);

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error(`Unsupported outbound protocol for ${url.toString()}`);
  }

  if (url.username || url.password) {
    throw new Error(`Outbound URLs may not embed credentials: ${url.toString()}`);
  }

  const hostname = url.hostname.toLowerCase();

  if (!hostname || isInternalHostname(hostname)) {
    throw new Error(`Blocked internal outbound host: ${hostname || url.toString()}`);
  }

  if (isIP(hostname) && isPrivateIp(hostname)) {
    throw new Error(`Blocked private outbound address: ${hostname}`);
  }

  if (!isIP(hostname)) {
    const safe = await isSafeResolvedHostname(hostname);

    if (!safe) {
      throw new Error(`Blocked outbound hostname that resolved to a private or invalid address: ${hostname}`);
    }
  }

  return url;
}
