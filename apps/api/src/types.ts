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

export interface PublicPerson {
  name: string;
  role?: string;
  sourcePage?: string;
}

export interface OrganizationPage {
  label: string;
  url: string;
}

export interface OrganizationProfile {
  website: string;
  name?: string;
  summary?: string;
  description?: string;
  foundedYear?: number;
  earliestArchiveYear?: number;
  location?: string;
  generator?: string;
  emails: string[];
  phones: string[];
  socialLinks: string[];
  relevantPages: OrganizationPage[];
  people: PublicPerson[];
  sources: string[];
}

export interface RelatedAsset {
  kind: "hostname" | "service" | "tag" | "certificate" | "person";
  value: string;
  relation: string;
  source: string;
}

export interface SourceResult {
  source: string;
  domains?: DomainAsset[];
  subdomains?: DomainAsset[];
  ipAddresses?: IpAsset[];
  organization?: OrganizationProfile;
  relatedAssets?: RelatedAsset[];
  notes?: string[];
}

export interface SearchResponse {
  query: ParsedQuery;
  domains: DomainAsset[];
  subdomains: DomainAsset[];
  ipAddresses: IpAsset[];
  organization: OrganizationProfile | null;
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
    peopleCount: number;
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
