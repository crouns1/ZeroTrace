import { config } from "../config.js";
import type { SearchResponse, SourceResult } from "../types.js";
import { GoogleDnsSource } from "../sources/dns-source.js";
import { InternetDbSource } from "../sources/internetdb-source.js";

export class EnrichmentWorker {
  constructor(
    private readonly dnsSource: GoogleDnsSource,
    private readonly internetDbSource: InternetDbSource,
  ) {}

  async enrich(result: SearchResponse): Promise<SourceResult[]> {
    if (result.query.operator === "ip") {
      return [];
    }

    const hostnames = [
      ...result.domains.map((entry) => ({ hostname: entry.hostname, kind: entry.kind })),
      ...result.subdomains.map((entry) => ({ hostname: entry.hostname, kind: entry.kind })),
    ]
      .slice(0, config.maxEnrichmentHosts);

    const dnsTasks = hostnames.map((entry) => this.dnsSource.lookupHost(entry.hostname, entry.kind));
    const dnsResults = await Promise.allSettled(dnsTasks);

    const ipTargets = new Set(result.ipAddresses.map((entry) => entry.address));

    for (const dnsResult of dnsResults) {
      if (dnsResult.status !== "fulfilled") {
        continue;
      }

      for (const ip of dnsResult.value.ipAddresses ?? []) {
        ipTargets.add(ip.address);
      }
    }

    const ipTasks = Array.from(ipTargets)
      .slice(0, config.maxEnrichmentHosts)
      .map((ip) => this.internetDbSource.lookupIp(ip));
    const ipResults = await Promise.allSettled(ipTasks);

    return [
      ...dnsResults.flatMap((item) => (item.status === "fulfilled" ? [item.value] : [])),
      ...ipResults.flatMap((item) => (item.status === "fulfilled" ? [item.value] : [])),
    ];
  }
}
