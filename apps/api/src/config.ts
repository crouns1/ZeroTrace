export const config = {
  port: Number(process.env.PORT ?? 4010),
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
  cacheTtlMs: Number(process.env.CACHE_TTL_MS ?? 5 * 60 * 1000),
  maxEnrichmentHosts: Number(process.env.MAX_ENRICHMENT_HOSTS ?? 6),
  requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS ?? 10_000),
  disclaimer:
    "Passive OSINT only. Use Zero Trace against assets you are authorized to investigate.",
};
