export const config = {
  port: Number(process.env.PORT ?? 4010),
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
  cacheTtlMs: Number(process.env.CACHE_TTL_MS ?? 5 * 60 * 1000),
  maxEnrichmentHosts: Number(process.env.MAX_ENRICHMENT_HOSTS ?? 6),
  maxOrganizationPages: Number(process.env.MAX_ORGANIZATION_PAGES ?? 6),
  archiveLookupTimeoutMs: Number(process.env.ARCHIVE_LOOKUP_TIMEOUT_MS ?? 4000),
  watchIntervalMs: Number(process.env.WATCH_INTERVAL_MS ?? 15 * 60 * 1000),
  watchMaxSnapshots: Number(process.env.WATCH_MAX_SNAPSHOTS ?? 8),
  redisUrl: process.env.REDIS_URL,
  requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS ?? 10_000),
  disclaimer:
    "Passive OSINT only. Use ReconPulse against assets you are authorized to investigate.",
};
