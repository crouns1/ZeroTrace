export type SearchOperator = "domain" | "subdomain" | "ip" | "text";

export interface ParsedQuery {
  raw: string;
  operator: SearchOperator;
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

export interface SourceResult {
  source: string;
  domains?: DomainAsset[];
  subdomains?: DomainAsset[];
  ipAddresses?: IpAsset[];
  relatedAssets?: RelatedAsset[];
  notes?: string[];
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

export interface SearchSource {
  readonly id: string;
  supports(query: ParsedQuery): boolean;
  search(query: ParsedQuery): Promise<SourceResult>;
}

