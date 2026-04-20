export type RiskLevel = "critical" | "high" | "medium" | "low";
export type AssetStatus = "active" | "investigate" | "watch" | "stale";
export type FindingSeverity = "critical" | "high" | "medium" | "low" | "info";
export type ReconJobStatus = "queued" | "running" | "completed" | "failed";
export type WatchStatus = "idle" | "running" | "completed" | "failed";
export type WatchChangeKind =
  | "subdomain-added"
  | "subdomain-removed"
  | "ip-added"
  | "port-opened"
  | "port-closed"
  | "tech-added"
  | "person-added"
  | "endpoint-added"
  | "high-probability-added";

export interface ParsedQuery {
  raw: string;
  operator: "domain" | "subdomain" | "ip" | "text" | "company" | "person";
  value: string;
  filters: {
    domain?: string;
    subdomain?: string;
    ip?: string;
    company?: string;
    person?: string;
    port?: number;
    status?: AssetStatus;
    risk?: RiskLevel;
    tech?: string;
    sort?: "risk" | "ports" | "recent" | "alphabetical";
    limit?: number;
  };
  terms: string[];
  recognizedFilters: string[];
}

export interface DomainAsset {
  hostname: string;
  kind: "domain" | "subdomain";
  sources: string[];
  ipAddresses: string[];
  cnameTargets: string[];
  dnsStatus: "resolved" | "cname-only" | "unresolved" | "unknown";
  httpStatus?: number;
  lastSeen?: string;
}

export interface IpAsset {
  address: string;
  sources: string[];
  hostnames: string[];
  openPorts: number[];
  tags: string[];
  vulns: string[];
  cpes: string[];
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

export interface ExternalProfileFact {
  label: string;
  value: string;
  href?: string;
}

export interface ExternalIntelProfile {
  id: string;
  kind: "company" | "person";
  name: string;
  description?: string;
  summary?: string;
  website?: string;
  aliases: string[];
  facts: ExternalProfileFact[];
  people: PublicPerson[];
  links: OrganizationPage[];
  notes: string[];
  source: string;
  confidence: "high" | "medium" | "low";
}

export interface OsintTrackerItem {
  id: string;
  label: string;
  value: string;
  href?: string;
  context?: string;
  source: string;
  confidence: "high" | "medium" | "low";
}

export interface OsintTrackerSection {
  id: string;
  title: string;
  description: string;
  items: OsintTrackerItem[];
}

export interface OsintCoverageSignal {
  id: string;
  label: string;
  source: string;
  status: "hit" | "partial" | "miss";
  detail: string;
}

export interface OsintTracker {
  target: string;
  highlights: string[];
  sections: OsintTrackerSection[];
  coverage: OsintCoverageSignal[];
  notes: string[];
}

export interface TechFingerprint {
  name: string;
  category: "cms" | "framework" | "server" | "cdn" | "platform" | "language" | "service";
  version?: string;
  source: string;
  confidence: "high" | "medium" | "low";
  historicalCves: string[];
  evidence?: string;
}

export interface EndpointAsset {
  path: string;
  url: string;
  source: string;
  kind: "robots" | "sitemap" | "common" | "public";
}

export interface SecurityHeaderObservation {
  name: string;
  present: boolean;
  value?: string;
}

export interface WebsiteProfile {
  baseUrl: string;
  finalUrl?: string;
  statusCode?: number;
  server?: string;
  poweredBy?: string;
  titles: string[];
  techStack: TechFingerprint[];
  endpoints: EndpointAsset[];
  securityHeaders: SecurityHeaderObservation[];
  sources: string[];
}

export interface ExposureFinding {
  id: string;
  type:
    | "open-port"
    | "misconfiguration"
    | "tech-cve"
    | "takeover"
    | "dns"
    | "endpoint"
    | "historical-vuln"
    | "exposure";
  title: string;
  description: string;
  severity: FindingSeverity;
  evidence: string[];
  source: string;
}

export interface WhereToLookSuggestion {
  title: string;
  reason: string;
  confidence: "high" | "medium" | "low";
}

export interface RelatedAsset {
  kind: "hostname" | "service" | "tag" | "certificate" | "person" | "endpoint" | "tech";
  value: string;
  relation: string;
  source: string;
}

export interface ReconInsight {
  id: string;
  label: string;
  assetType: "domain" | "subdomain" | "ip";
  hostname?: string;
  ipAddress?: string;
  hostnames: string[];
  ipAddresses: string[];
  openPorts: number[];
  linkedServiceLabels: string[];
  techStack: TechFingerprint[];
  findings: ExposureFinding[];
  whereToLook: WhereToLookSuggestion[];
  riskScore: number;
  riskLevel: RiskLevel;
  status: AssetStatus;
  likelyVulnerable: boolean;
  sourceCount: number;
  sources: string[];
  lastSeen?: string;
}

export interface ReconGraphNode {
  id: string;
  label: string;
  type: "domain" | "subdomain" | "ip" | "tech" | "person" | "endpoint";
  riskLevel?: RiskLevel;
  meta?: string;
}

export interface ReconGraphEdge {
  source: string;
  target: string;
  label: string;
}

export interface ReconGraph {
  nodes: ReconGraphNode[];
  edges: ReconGraphEdge[];
}

export interface ReconPipelineStage {
  id: string;
  label: string;
  description: string;
  status: "pending" | "running" | "completed" | "failed";
  itemsDiscovered: number;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
}

export interface ReconPipeline {
  mode: "sync" | "job";
  status: "pending" | "running" | "completed" | "failed";
  stages: ReconPipelineStage[];
}

export interface SearchResponse {
  query: ParsedQuery;
  domains: DomainAsset[];
  subdomains: DomainAsset[];
  ipAddresses: IpAsset[];
  organization: OrganizationProfile | null;
  websiteProfile: WebsiteProfile | null;
  externalProfiles: ExternalIntelProfile[];
  osintTracker: OsintTracker | null;
  insights: ReconInsight[];
  highProbabilityTargets: ReconInsight[];
  openPorts: Array<{
    ip: string;
    port: number;
    source: string;
  }>;
  relatedAssets: RelatedAsset[];
  sources: string[];
  notes: string[];
  graph: ReconGraph;
  pipeline: ReconPipeline;
  suggestions: string[];
  filtersApplied: string[];
  stats: {
    domainCount: number;
    subdomainCount: number;
    ipCount: number;
    peopleCount: number;
    portCount: number;
    relatedAssetCount: number;
    insightCount: number;
    highProbabilityCount: number;
  };
  metadata: {
    cached: boolean;
    durationMs: number;
    disclaimer: string;
  };
  performance: {
    cacheProvider: string;
    jobProvider: string;
    indexingProvider: string;
  };
  exportFormats: Array<"json" | "csv">;
}

export interface ReconJob {
  id: string;
  query: string;
  status: ReconJobStatus;
  progress: number;
  currentStage?: string;
  createdAt: string;
  updatedAt: string;
  result?: SearchResponse;
  error?: string;
}

export interface WatchChange {
  id: string;
  kind: WatchChangeKind;
  severity: FindingSeverity;
  label: string;
  detail: string;
  observedAt: string;
}

export interface WatchSnapshot {
  id: string;
  createdAt: string;
  durationMs: number;
  stats: SearchResponse["stats"];
  changeCount: number;
  changes: WatchChange[];
}

export interface WatchTarget {
  id: string;
  query: string;
  label: string;
  createdAt: string;
  updatedAt: string;
  lastCheckedAt?: string;
  nextCheckAt?: string;
  status: WatchStatus;
  autoRefreshIntervalMs: number;
  lastError?: string;
  latestSnapshot?: WatchSnapshot;
  snapshots: WatchSnapshot[];
}

export interface HistoryEntry {
  query: string;
  searchedAt: string;
  stats: SearchResponse["stats"];
}
