import { config } from "../config.js";
import { TtlCache } from "../lib/cache.js";
import { parseQuery } from "../lib/query.js";
import { CertSpotterSource } from "../sources/certspotter-source.js";
import { GoogleDnsSource } from "../sources/dns-source.js";
import { InternetDbSource } from "../sources/internetdb-source.js";
import type {
  DomainAsset,
  IpAsset,
  RelatedAsset,
  SearchResponse,
  SearchSource,
  SourceResult,
} from "../types.js";
import { EnrichmentWorker } from "./enrichment-worker.js";

function mergeDomainAssets(target: Map<string, DomainAsset>, assets: DomainAsset[]): void {
  for (const asset of assets) {
    const existing = target.get(asset.hostname);

    if (!existing) {
      target.set(asset.hostname, {
        ...asset,
        sources: [...asset.sources],
        ipAddresses: [...asset.ipAddresses],
      });
      continue;
    }

    existing.kind = asset.kind;
    existing.sources = Array.from(new Set([...existing.sources, ...asset.sources]));
    existing.ipAddresses = Array.from(new Set([...existing.ipAddresses, ...asset.ipAddresses]));
    existing.lastSeen = existing.lastSeen ?? asset.lastSeen;
  }
}

function mergeIpAssets(target: Map<string, IpAsset>, assets: IpAsset[]): void {
  for (const asset of assets) {
    const existing = target.get(asset.address);

    if (!existing) {
      target.set(asset.address, {
        ...asset,
        sources: [...asset.sources],
        hostnames: [...asset.hostnames],
        openPorts: [...asset.openPorts],
        tags: [...asset.tags],
        vulns: [...asset.vulns],
      });
      continue;
    }

    existing.sources = Array.from(new Set([...existing.sources, ...asset.sources]));
    existing.hostnames = Array.from(new Set([...existing.hostnames, ...asset.hostnames]));
    existing.openPorts = Array.from(new Set([...existing.openPorts, ...asset.openPorts])).sort(
      (left, right) => left - right,
    );
    existing.tags = Array.from(new Set([...existing.tags, ...asset.tags]));
    existing.vulns = Array.from(new Set([...existing.vulns, ...asset.vulns]));
  }
}

function buildResponse(results: SourceResult[], query: SearchResponse["query"], durationMs: number): SearchResponse {
  const domains = new Map<string, DomainAsset>();
  const subdomains = new Map<string, DomainAsset>();
  const ipAddresses = new Map<string, IpAsset>();
  const relatedAssets = new Map<string, RelatedAsset>();
  const notes = new Set<string>();
  const sources = new Set<string>();

  for (const result of results) {
    sources.add(result.source);
    mergeDomainAssets(domains, result.domains ?? []);
    mergeDomainAssets(subdomains, result.subdomains ?? []);
    mergeIpAssets(ipAddresses, result.ipAddresses ?? []);

    for (const asset of result.relatedAssets ?? []) {
      relatedAssets.set(`${asset.kind}:${asset.value}:${asset.relation}`, asset);
    }

    for (const note of result.notes ?? []) {
      notes.add(note);
    }
  }

  for (const domain of domains.values()) {
    for (const ip of domain.ipAddresses) {
      const existing = ipAddresses.get(ip);

      if (existing) {
        existing.hostnames = Array.from(new Set([...existing.hostnames, domain.hostname]));
      }
    }
  }

  for (const subdomain of subdomains.values()) {
    for (const ip of subdomain.ipAddresses) {
      const existing = ipAddresses.get(ip);

      if (existing) {
        existing.hostnames = Array.from(new Set([...existing.hostnames, subdomain.hostname]));
      }
    }
  }

  const finalDomains = Array.from(domains.values()).sort((left, right) =>
    left.hostname.localeCompare(right.hostname),
  );
  const finalSubdomains = Array.from(subdomains.values()).sort((left, right) =>
    left.hostname.localeCompare(right.hostname),
  );
  const finalIps = Array.from(ipAddresses.values()).sort((left, right) =>
    left.address.localeCompare(right.address),
  );
  const finalRelatedAssets = Array.from(relatedAssets.values()).sort((left, right) =>
    left.value.localeCompare(right.value),
  );
  const openPorts = finalIps.flatMap((entry) =>
    entry.openPorts.map((port) => ({
      ip: entry.address,
      port,
      source: entry.sources[entry.sources.length - 1] ?? "unknown",
    })),
  );

  return {
    query,
    domains: finalDomains,
    subdomains: finalSubdomains,
    ipAddresses: finalIps,
    openPorts,
    relatedAssets: finalRelatedAssets,
    sources: Array.from(sources).sort(),
    notes: Array.from(notes),
    stats: {
      domainCount: finalDomains.length,
      subdomainCount: finalSubdomains.length,
      ipCount: finalIps.length,
      portCount: openPorts.length,
      relatedAssetCount: finalRelatedAssets.length,
    },
    metadata: {
      cached: false,
      durationMs,
      disclaimer: config.disclaimer,
    },
  };
}

function buildEmptyResponse(
  query: SearchResponse["query"],
  durationMs: number,
  notes: string[],
): SearchResponse {
  return {
    query,
    domains: [],
    subdomains: [],
    ipAddresses: [],
    openPorts: [],
    relatedAssets: [],
    sources: [],
    notes,
    stats: {
      domainCount: 0,
      subdomainCount: 0,
      ipCount: 0,
      portCount: 0,
      relatedAssetCount: 0,
    },
    metadata: {
      cached: false,
      durationMs,
      disclaimer: config.disclaimer,
    },
  };
}

export class SearchService {
  private readonly cache = new TtlCache<SearchResponse>(config.cacheTtlMs);
  private readonly dnsSource = new GoogleDnsSource();
  private readonly internetDbSource = new InternetDbSource();
  private readonly sources: SearchSource[] = [
    new CertSpotterSource(),
    this.dnsSource,
    this.internetDbSource,
  ];
  private readonly enrichmentWorker = new EnrichmentWorker(this.dnsSource, this.internetDbSource);

  async search(rawQuery: string): Promise<SearchResponse> {
    const parsedQuery = parseQuery(rawQuery);
    const cacheKey = parsedQuery.raw.toLowerCase();
    const cached = this.cache.get(cacheKey);

    if (cached) {
      return {
        ...cached,
        metadata: {
          ...cached.metadata,
          cached: true,
        },
      };
    }

    const startedAt = Date.now();
    const baseSources = this.sources.filter((source) => source.supports(parsedQuery));

    if (baseSources.length === 0) {
      return buildEmptyResponse(parsedQuery, Date.now() - startedAt, [
        "No source adapter matched this query. Try domain:, subdomain:, or ip: operators.",
      ]);
    }

    const baseResults = await Promise.all(
      baseSources.map(async (source) => {
        try {
          return {
            sourceId: source.id,
            result: await source.search(parsedQuery),
          };
        } catch (error) {
          return {
            sourceId: source.id,
            error: error instanceof Error ? error.message : "Unknown source error.",
          };
        }
      }),
    );
    const collected = baseResults
      .map((entry) => ("result" in entry ? entry.result : undefined))
      .filter((entry): entry is SourceResult => Boolean(entry));
    const sourceErrors = baseResults.flatMap((entry) =>
      "error" in entry ? [`${entry.sourceId} failed: ${entry.error}`] : [],
    );
    const response = buildResponse(collected, parsedQuery, Date.now() - startedAt);
    const enrichmentResults = await this.enrichmentWorker.enrich(response);
    const enrichedResponse = buildResponse(
      [...collected, ...enrichmentResults],
      parsedQuery,
      Date.now() - startedAt,
    );

    if (sourceErrors.length > 0) {
      enrichedResponse.notes = Array.from(new Set([...enrichedResponse.notes, ...sourceErrors]));
    }

    this.cache.set(cacheKey, enrichedResponse);
    return enrichedResponse;
  }
}
