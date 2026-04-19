import { fetchJson } from "../lib/http.js";
import type { IpAsset, ParsedQuery, SearchSource, SourceResult } from "../types.js";

interface InternetDbResponse {
  cpes?: string[];
  hostnames?: string[];
  ip?: string;
  ports?: number[];
  tags?: string[];
  vulns?: string[];
}

export class InternetDbSource implements SearchSource {
  readonly id = "internetdb";

  supports(query: ParsedQuery): boolean {
    return query.operator === "ip";
  }

  async search(query: ParsedQuery): Promise<SourceResult> {
    return this.lookupIp(query.value);
  }

  async lookupIp(ip: string): Promise<SourceResult> {
    const url = `https://internetdb.shodan.io/${encodeURIComponent(ip)}`;
    const response = await fetchJson<InternetDbResponse>(url);

    const ipAsset: IpAsset = {
      address: response.ip ?? ip,
      sources: [this.id],
      hostnames: response.hostnames ?? [],
      openPorts: response.ports ?? [],
      tags: response.tags ?? [],
      vulns: response.vulns ?? [],
      cpes: response.cpes ?? [],
    };

    const relatedAssets: SourceResult["relatedAssets"] = [];

    for (const tag of response.tags ?? []) {
      relatedAssets?.push({
        kind: "tag",
        value: tag,
        relation: `tagged on ${ipAsset.address}`,
        source: this.id,
      });
    }

    for (const hostname of response.hostnames ?? []) {
      relatedAssets?.push({
        kind: "hostname",
        value: hostname,
        relation: `reverse hostname for ${ipAsset.address}`,
        source: this.id,
      });
    }

    for (const cpe of response.cpes ?? []) {
      relatedAssets?.push({
        kind: "service",
        value: cpe,
        relation: `service fingerprint on ${ipAsset.address}`,
        source: this.id,
      });
    }

    return {
      source: this.id,
      ipAddresses: [ipAsset],
      relatedAssets,
      notes:
        ipAsset.openPorts.length === 0
          ? [`InternetDB has no passive port data for ${ipAsset.address}.`]
          : [],
    };
  }
}
