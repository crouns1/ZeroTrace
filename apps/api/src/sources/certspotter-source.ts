import { fetchJson } from "../lib/http.js";
import { isDomainLike } from "../lib/query.js";
import type { DomainAsset, ParsedQuery, SearchSource, SourceResult } from "../types.js";

interface CertSpotterIssuance {
  dns_names?: string[];
  not_after?: string;
}

function normalizeHostname(value: string): string {
  return value.replace(/^\*\./, "").trim().toLowerCase();
}

export class CertSpotterSource implements SearchSource {
  readonly id = "certspotter";

  supports(query: ParsedQuery): boolean {
    return (
      query.operator === "domain" ||
      query.operator === "subdomain" ||
      (query.operator === "text" && isDomainLike(query.value))
    );
  }

  async search(query: ParsedQuery): Promise<SourceResult> {
    const target = query.value.toLowerCase();
    const params = new URLSearchParams({
      domain: target,
      expand: "dns_names",
    });

    if (query.operator !== "subdomain") {
      params.set("include_subdomains", "true");
    }

    const parsed = await fetchJson<CertSpotterIssuance[]>(
      `https://api.certspotter.com/v1/issuances?${params.toString()}`,
    );

    const seen = new Map<string, DomainAsset>();
    const relatedAssets: SourceResult["relatedAssets"] = [];

    for (const record of parsed) {
      const values = (record.dns_names ?? [])
        .map(normalizeHostname)
        .filter(Boolean);

      for (const hostname of values) {
        if (query.operator === "domain" && !hostname.endsWith(target)) {
          continue;
        }

        if (query.operator === "subdomain" && hostname !== target) {
          continue;
        }

        const kind = hostname === target ? "domain" : "subdomain";
        const current = seen.get(hostname);

        if (!current) {
          seen.set(hostname, {
            hostname,
            kind,
            sources: [this.id],
            ipAddresses: [],
            cnameTargets: [],
            dnsStatus: "unknown",
            lastSeen: record.not_after,
          });
        } else if (!current.lastSeen && record.not_after) {
          current.lastSeen = record.not_after;
        }

        relatedAssets?.push({
          kind: "certificate",
          value: hostname,
          relation: "observed in certificate transparency logs",
          source: this.id,
        });
      }
    }

    const domainAssets = Array.from(seen.values());

    return {
      source: this.id,
      domains: domainAssets.filter((asset) => asset.kind === "domain"),
      subdomains: domainAssets.filter((asset) => asset.kind === "subdomain"),
      relatedAssets,
      notes:
        domainAssets.length === 0
          ? ["Certificate transparency search returned no matching issuances."]
          : [],
    };
  }
}
