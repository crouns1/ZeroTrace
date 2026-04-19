export interface ParsedQuery {
  raw: string;
  operator: "domain" | "subdomain" | "ip" | "text";
  value: string;
  filters: {
    domain?: string;
    subdomain?: string;
    ip?: string;
  };
  terms: string[];
}

export interface DomainAsset {
  hostname: string;
  kind: "domain" | "subdomain";
  sources: string[];
  ipAddresses: string[];
  lastSeen?: string;
}

export interface IpAsset {
  address: string;
  sources: string[];
  hostnames: string[];
  openPorts: number[];
  tags: string[];
  vulns: string[];
}

export interface RelatedAsset {
  kind: "hostname" | "service" | "tag" | "certificate";
  value: string;
  relation: string;
  source: string;
}

export interface SearchResponse {
  query: ParsedQuery;
  domains: DomainAsset[];
  subdomains: DomainAsset[];
  ipAddresses: IpAsset[];
  openPorts: Array<{
    ip: string;
    port: number;
    source: string;
  }>;
  relatedAssets: RelatedAsset[];
  sources: string[];
  notes: string[];
  stats: {
    domainCount: number;
    subdomainCount: number;
    ipCount: number;
    portCount: number;
    relatedAssetCount: number;
  };
  metadata: {
    cached: boolean;
    durationMs: number;
    disclaimer: string;
  };
}

export interface HistoryEntry {
  query: string;
  searchedAt: string;
  stats: SearchResponse["stats"];
}

