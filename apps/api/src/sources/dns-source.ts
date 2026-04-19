import { fetchJson } from "../lib/http.js";
import { isDomainLike } from "../lib/query.js";
import type { DomainAsset, IpAsset, ParsedQuery, SearchSource, SourceResult } from "../types.js";

interface DnsAnswer {
  data?: string;
  name?: string;
  type?: number;
}

interface DnsResponse {
  Answer?: DnsAnswer[];
}

function normalizeIp(value: string): string | null {
  const cleaned = value.trim();
  return cleaned ? cleaned : null;
}

export class GoogleDnsSource implements SearchSource {
  readonly id = "google-dns";

  supports(query: ParsedQuery): boolean {
    return query.operator !== "ip" && isDomainLike(query.value);
  }

  async search(query: ParsedQuery): Promise<SourceResult> {
    return this.lookupHost(query.value, query.operator === "subdomain" ? "subdomain" : "domain");
  }

  async lookupHost(hostname: string, preferredKind: "domain" | "subdomain" = "domain"): Promise<SourceResult> {
    const target = hostname.toLowerCase();
    const [aRecords, aaaaRecords, cnameRecords] = await Promise.all([
      this.resolve(target, "A"),
      this.resolve(target, "AAAA"),
      this.resolve(target, "CNAME"),
    ]);

    const ipSet = new Set<string>();
    const cnameTargets = new Set<string>();
    const relatedAssets: SourceResult["relatedAssets"] = [];

    for (const answer of [...aRecords, ...aaaaRecords]) {
      const ip = normalizeIp(answer.data ?? "");

      if (ip) {
        ipSet.add(ip);
      }
    }

    for (const answer of cnameRecords) {
      if (!answer.data) {
        continue;
      }

      const cname = answer.data.replace(/\.$/, "");
      cnameTargets.add(cname);
      relatedAssets?.push({
        kind: "hostname",
        value: cname,
        relation: `${target} resolves via CNAME`,
        source: this.id,
      });
    }

    const domain: DomainAsset = {
      hostname: target,
      kind: preferredKind,
      sources: [this.id],
      ipAddresses: Array.from(ipSet),
      cnameTargets: Array.from(cnameTargets),
      dnsStatus:
        ipSet.size > 0
          ? "resolved"
          : cnameTargets.size > 0
            ? "cname-only"
            : "unresolved",
    };

    const ipAddresses: IpAsset[] = Array.from(ipSet).map((address) => ({
      address,
      sources: [this.id],
      hostnames: [target],
      openPorts: [],
      tags: [],
      vulns: [],
      cpes: [],
    }));

    return {
      source: this.id,
      domains: domain.kind === "domain" ? [domain] : [],
      subdomains: domain.kind === "subdomain" ? [domain] : [],
      ipAddresses,
      relatedAssets,
      notes: ipAddresses.length === 0 ? [`No DNS answers found for ${target}.`] : [],
    };
  }

  private async resolve(hostname: string, type: "A" | "AAAA" | "CNAME"): Promise<DnsAnswer[]> {
    const url = `https://dns.google/resolve?name=${encodeURIComponent(hostname)}&type=${type}`;
    const response = await fetchJson<DnsResponse>(url);
    return response.Answer ?? [];
  }
}
