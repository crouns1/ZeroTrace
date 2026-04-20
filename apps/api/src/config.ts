function parseNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseList(value: string | undefined, fallback: string[]): string[] {
  const items = (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return items.length > 0 ? items : fallback;
}

const defaultCorsOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
];

export const config = {
  port: parseNumber(process.env.PORT, 4010),
  corsOrigins: parseList(process.env.CORS_ORIGIN, defaultCorsOrigins),
  cacheTtlMs: parseNumber(process.env.CACHE_TTL_MS, 5 * 60 * 1000),
  maxEnrichmentHosts: parseNumber(process.env.MAX_ENRICHMENT_HOSTS, 6),
  maxOrganizationPages: parseNumber(process.env.MAX_ORGANIZATION_PAGES, 6),
  archiveLookupTimeoutMs: parseNumber(process.env.ARCHIVE_LOOKUP_TIMEOUT_MS, 4000),
  watchIntervalMs: parseNumber(process.env.WATCH_INTERVAL_MS, 15 * 60 * 1000),
  watchMaxSnapshots: parseNumber(process.env.WATCH_MAX_SNAPSHOTS, 8),
  redisUrl: process.env.REDIS_URL,
  requestTimeoutMs: parseNumber(process.env.REQUEST_TIMEOUT_MS, 10_000),
  rateLimitWindowMs: parseNumber(process.env.RATE_LIMIT_WINDOW_MS, 60_000),
  rateLimitSearchMax: parseNumber(process.env.RATE_LIMIT_SEARCH_MAX, 60),
  rateLimitMutationMax: parseNumber(process.env.RATE_LIMIT_MUTATION_MAX, 20),
  authApiKeys: parseList(process.env.RECONPULSE_API_KEYS, []),
  auditLogPath: process.env.AUDIT_LOG_PATH ?? "logs/audit.jsonl",
  watchStoragePath: process.env.WATCH_STORAGE_PATH ?? "data/watch-targets.json",
  notificationWebhookUrls: parseList(process.env.WATCH_NOTIFICATION_WEBHOOK_URLS, []),
  outboundMaxRedirects: parseNumber(process.env.OUTBOUND_MAX_REDIRECTS, 4),
  outboundDnsCacheMs: parseNumber(process.env.OUTBOUND_DNS_CACHE_MS, 5 * 60 * 1000),
  disclaimer:
    "Passive OSINT only. Use ReconPulse against assets you are authorized to investigate.",
};
