import type {
  AssetStatus,
  DomainAsset,
  ExposureFinding,
  IpAsset,
  ParsedQuery,
  ReconGraph,
  ReconInsight,
  RelatedAsset,
  RiskLevel,
  SearchResponse,
  TechFingerprint,
  WebsiteProfile,
  WhereToLookSuggestion,
} from "../types.js";

const RISKY_PORTS = new Map<number, { score: number; label: string }>([
  [21, { score: 10, label: "FTP" }],
  [22, { score: 8, label: "SSH" }],
  [23, { score: 18, label: "Telnet" }],
  [80, { score: 4, label: "HTTP" }],
  [443, { score: 4, label: "HTTPS" }],
  [3000, { score: 10, label: "Dev server" }],
  [3306, { score: 16, label: "MySQL" }],
  [3389, { score: 18, label: "RDP" }],
  [5000, { score: 12, label: "App service" }],
  [5432, { score: 14, label: "PostgreSQL" }],
  [5601, { score: 16, label: "Kibana" }],
  [6379, { score: 18, label: "Redis" }],
  [8080, { score: 10, label: "Alt HTTP" }],
  [8443, { score: 10, label: "Alt HTTPS" }],
  [9200, { score: 18, label: "Elasticsearch" }],
  [9300, { score: 18, label: "Elasticsearch node" }],
]);

const TAKEOVER_PATTERNS: Array<{ pattern: RegExp; provider: string }> = [
  { pattern: /github\.io$/i, provider: "GitHub Pages" },
  { pattern: /herokudns\.com$/i, provider: "Heroku" },
  { pattern: /azurewebsites\.net$/i, provider: "Azure App Service" },
  { pattern: /cloudfront\.net$/i, provider: "CloudFront" },
  { pattern: /fastly\.net$/i, provider: "Fastly" },
  { pattern: /surge\.sh$/i, provider: "Surge" },
];

function severityWeight(severity: ExposureFinding["severity"]): number {
  if (severity === "critical") {
    return 28;
  }

  if (severity === "high") {
    return 18;
  }

  if (severity === "medium") {
    return 10;
  }

  if (severity === "low") {
    return 4;
  }

  return 1;
}

function scoreToRiskLevel(score: number): RiskLevel {
  if (score >= 85) {
    return "critical";
  }

  if (score >= 70) {
    return "high";
  }

  if (score >= 45) {
    return "medium";
  }

  return "low";
}

function buildTechFromCpe(cpe: string): TechFingerprint {
  const segments = cpe.split(":");
  const vendor = segments[3] ?? "";
  const product = segments[4] ?? "";
  const version = segments[5] && segments[5] !== "*" ? segments[5] : undefined;
  const name = [vendor, product].filter(Boolean).join(" ");

  return {
    name: name || cpe,
    category: "service",
    version,
    source: "internetdb-cpe",
    confidence: version ? "high" : "medium",
    historicalCves: version ? [] : [],
    evidence: cpe,
  };
}

function uniqueTechStack(stack: TechFingerprint[]): TechFingerprint[] {
  return Array.from(new Map(stack.map((item) => [`${item.name}:${item.source}`, item])).values());
}

function buildWhereToLook(findings: ExposureFinding[]): WhereToLookSuggestion[] {
  const suggestions: WhereToLookSuggestion[] = [];

  if (findings.some((finding) => finding.type === "takeover")) {
    suggestions.push({
      title: "Validate subdomain takeover",
      reason: "The hostname has a SaaS-style CNAME or incomplete DNS response that deserves manual validation.",
      confidence: "high",
    });
  }

  if (findings.some((finding) => finding.type === "endpoint")) {
    suggestions.push({
      title: "Probe privileged endpoints",
      reason: "Public endpoints such as /admin, /api, /graphql, or robots-disallowed paths were discovered.",
      confidence: "high",
    });
  }

  if (findings.some((finding) => finding.type === "tech-cve" || finding.type === "historical-vuln")) {
    suggestions.push({
      title: "Check historical CVE families",
      reason: "The detected stack maps to technologies with relevant historical vulnerabilities.",
      confidence: "medium",
    });
  }

  if (findings.some((finding) => finding.type === "open-port")) {
    suggestions.push({
      title: "Verify exposed management surfaces",
      reason: "The asset exposes ports commonly associated with admin panels, developer servers, or databases.",
      confidence: "medium",
    });
  }

  if (findings.some((finding) => finding.type === "misconfiguration")) {
    suggestions.push({
      title: "Review web hardening gaps",
      reason: "Security header gaps or weak web fingerprinting signals suggest softer edges worth manual review.",
      confidence: "medium",
    });
  }

  return suggestions.slice(0, 4);
}

function buildIpFindings(ip: IpAsset): ExposureFinding[] {
  const findings: ExposureFinding[] = [];

  for (const port of ip.openPorts) {
    const risky = RISKY_PORTS.get(port);

    if (!risky) {
      continue;
    }

    findings.push({
      id: `${ip.address}-port-${port}`,
      type: "open-port",
      title: `Port ${port} exposed`,
      description: `${risky.label} is visible on ${ip.address}. Publicly exposed management or development services often deserve a closer look.`,
      severity: port === 23 || port === 6379 || port === 9200 ? "high" : "medium",
      evidence: [`${ip.address}:${port}`],
      source: ip.sources.join(", "),
    });
  }

  for (const vuln of ip.vulns) {
    findings.push({
      id: `${ip.address}-vuln-${vuln}`,
      type: "tech-cve",
      title: `Historical CVE signal ${vuln}`,
      description: `${ip.address} is associated with ${vuln} in passive enrichment data.`,
      severity: "high",
      evidence: [vuln],
      source: "internetdb",
    });
  }

  return findings;
}

function buildDomainFindings(
  asset: DomainAsset,
  linkedIps: IpAsset[],
  websiteProfile: WebsiteProfile | null,
): ExposureFinding[] {
  const findings: ExposureFinding[] = [];

  if (asset.dnsStatus === "unresolved") {
    findings.push({
      id: `${asset.hostname}-dns-unresolved`,
      type: "dns",
      title: "No active DNS answers",
      description: `${asset.hostname} has no active A/AAAA records in passive DNS resolution.`,
      severity: "medium",
      evidence: [asset.hostname],
      source: "google-dns",
    });
  }

  if (asset.dnsStatus === "cname-only") {
    findings.push({
      id: `${asset.hostname}-dns-cname-only`,
      type: "dns",
      title: "CNAME without resolved origin",
      description: `${asset.hostname} resolves only through CNAMEs with no observed origin IPs.`,
      severity: "medium",
      evidence: asset.cnameTargets,
      source: "google-dns",
    });
  }

  const takeoverTarget = asset.cnameTargets.find((target) =>
    TAKEOVER_PATTERNS.some((pattern) => pattern.pattern.test(target)),
  );

  if (takeoverTarget && asset.ipAddresses.length === 0) {
    const provider =
      TAKEOVER_PATTERNS.find((pattern) => pattern.pattern.test(takeoverTarget))?.provider ?? "known SaaS provider";

    findings.push({
      id: `${asset.hostname}-takeover`,
      type: "takeover",
      title: "Potential subdomain takeover candidate",
      description: `${asset.hostname} points to ${provider} via CNAME without an observed origin. Validate whether the SaaS tenant is still claimed.`,
      severity: "high",
      evidence: [takeoverTarget],
      source: "google-dns",
    });
  }

  if (websiteProfile) {
    const missingHeaders = websiteProfile.securityHeaders.filter((header) => !header.present);

    for (const header of missingHeaders.slice(0, 3)) {
      findings.push({
        id: `${asset.hostname}-header-${header.name}`,
        type: "misconfiguration",
        title: `Missing ${header.name}`,
        description: `${asset.hostname} does not expose ${header.name} on the fetched web surface.`,
        severity: header.name === "content-security-policy" ? "medium" : "low",
        evidence: [header.name],
        source: "website-profile",
      });
    }

    for (const endpoint of websiteProfile.endpoints) {
      if (!/(admin|graphql|api|login|internal|debug)/i.test(endpoint.path)) {
        continue;
      }

      findings.push({
        id: `${asset.hostname}-endpoint-${endpoint.path}`,
        type: "endpoint",
        title: `Interesting endpoint ${endpoint.path}`,
        description: `${endpoint.path} was discovered passively and may expose privileged or attack-surface-heavy functionality.`,
        severity: /(admin|graphql|debug)/i.test(endpoint.path) ? "high" : "medium",
        evidence: [endpoint.url],
        source: endpoint.source,
      });
    }

    for (const technology of websiteProfile.techStack) {
      for (const cve of technology.historicalCves) {
        findings.push({
          id: `${asset.hostname}-${technology.name}-${cve}`,
          type: "historical-vuln",
          title: `${technology.name} historical vulnerability family`,
          description: `${technology.name} is visible on the web stack. ${cve} is a known historical reference worth checking against version or configuration.`,
          severity: "medium",
          evidence: [technology.evidence ?? technology.name, cve],
          source: technology.source,
        });
      }
    }
  }

  for (const ip of linkedIps) {
    findings.push(...buildIpFindings(ip));
  }

  return findings;
}

function insightStatus(findings: ExposureFinding[], asset: DomainAsset | IpAsset): AssetStatus {
  if ("dnsStatus" in asset && asset.dnsStatus === "unresolved") {
    return "stale";
  }

  if (findings.some((finding) => finding.type === "takeover" || finding.severity === "high" || finding.severity === "critical")) {
    return "investigate";
  }

  if (findings.some((finding) => finding.type === "misconfiguration" || finding.type === "endpoint")) {
    return "watch";
  }

  return "active";
}

function scoreFindings(findings: ExposureFinding[]): number {
  return findings.reduce((total, finding) => total + severityWeight(finding.severity), 0);
}

function sortInsights(insights: ReconInsight[], sortMode: ParsedQuery["filters"]["sort"]): ReconInsight[] {
  const next = [...insights];

  if (sortMode === "ports") {
    return next.sort((left, right) => right.openPorts.length - left.openPorts.length);
  }

  if (sortMode === "recent") {
    return next.sort((left, right) => (right.lastSeen ?? "").localeCompare(left.lastSeen ?? ""));
  }

  if (sortMode === "alphabetical") {
    return next.sort((left, right) => left.label.localeCompare(right.label));
  }

  return next.sort((left, right) => right.riskScore - left.riskScore);
}

function applyFilters(insights: ReconInsight[], query: ParsedQuery): ReconInsight[] {
  return insights.filter((insight) => {
    if (query.filters.port && !insight.openPorts.includes(query.filters.port)) {
      return false;
    }

    if (query.filters.status && insight.status !== query.filters.status) {
      return false;
    }

    if (query.filters.risk && insight.riskLevel !== query.filters.risk) {
      return false;
    }

    if (
      query.filters.tech &&
      !insight.techStack.some((technology) =>
        technology.name.toLowerCase().includes(query.filters.tech ?? ""),
      )
    ) {
      return false;
    }

    return true;
  });
}

function buildGraph(
  insights: ReconInsight[],
  organizationPeople: SearchResponse["organization"],
  websiteProfile: WebsiteProfile | null,
): ReconGraph {
  const nodes = new Map<string, ReconGraph["nodes"][number]>();
  const edges = new Map<string, ReconGraph["edges"][number]>();

  const addNode = (node: ReconGraph["nodes"][number]) => {
    nodes.set(node.id, node);
  };
  const addEdge = (edge: ReconGraph["edges"][number]) => {
    edges.set(`${edge.source}:${edge.target}:${edge.label}`, edge);
  };

  for (const insight of insights.slice(0, 12)) {
    addNode({
      id: insight.id,
      label: insight.label,
      type: insight.assetType,
      riskLevel: insight.riskLevel,
      meta: `${insight.riskScore}`,
    });

    for (const ip of insight.ipAddresses.slice(0, 4)) {
      addNode({
        id: `ip:${ip}`,
        label: ip,
        type: "ip",
      });
      addEdge({
        source: insight.id,
        target: `ip:${ip}`,
        label: "resolves to",
      });
    }

    for (const technology of insight.techStack.slice(0, 4)) {
      addNode({
        id: `tech:${technology.name}`,
        label: technology.name,
        type: "tech",
      });
      addEdge({
        source: insight.id,
        target: `tech:${technology.name}`,
        label: "runs",
      });
    }
  }

  if (websiteProfile) {
    for (const endpoint of websiteProfile.endpoints.slice(0, 6)) {
      addNode({
        id: `endpoint:${endpoint.path}`,
        label: endpoint.path,
        type: "endpoint",
      });

      const owner = insights.find((insight) => insight.assetType !== "ip");

      if (owner) {
        addEdge({
          source: owner.id,
          target: `endpoint:${endpoint.path}`,
          label: "exposes",
        });
      }
    }
  }

  if (organizationPeople) {
    for (const person of organizationPeople.people.slice(0, 6)) {
      addNode({
        id: `person:${person.name}`,
        label: person.name,
        type: "person",
        meta: person.role,
      });

      const owner = insights.find((insight) => insight.assetType !== "ip");

      if (owner) {
        addEdge({
          source: owner.id,
          target: `person:${person.name}`,
          label: "listed by",
        });
      }
    }
  }

  return {
    nodes: Array.from(nodes.values()),
    edges: Array.from(edges.values()),
  };
}

export class IntelligenceService {
  buildResponse(base: SearchResponse): SearchResponse {
    const websiteHostname = base.websiteProfile ? new URL(base.websiteProfile.baseUrl).hostname.toLowerCase() : undefined;
    const techStack = base.websiteProfile?.techStack ?? [];
    const domainInsights = [...base.domains, ...base.subdomains].map((asset) => {
      const linkedIps = base.ipAddresses.filter((ip) => asset.ipAddresses.includes(ip.address));
      const linkedTech = uniqueTechStack([
        ...(asset.hostname === websiteHostname || base.query.value === asset.hostname ? techStack : []),
        ...linkedIps.flatMap((ip) => ip.cpes.map(buildTechFromCpe)),
      ]);
      const findings = buildDomainFindings(
        asset,
        linkedIps,
        asset.hostname === websiteHostname || base.query.value === asset.hostname ? base.websiteProfile : null,
      );
      const riskScore = Math.min(100, 10 + scoreFindings(findings));

      return {
        id: `${asset.kind}:${asset.hostname}`,
        label: asset.hostname,
        assetType: asset.kind,
        hostname: asset.hostname,
        hostnames: [asset.hostname],
        ipAddresses: asset.ipAddresses,
        openPorts: linkedIps.flatMap((ip) => ip.openPorts),
        linkedServiceLabels: linkedTech.map((technology) => technology.name),
        techStack: linkedTech,
        findings,
        whereToLook: buildWhereToLook(findings),
        riskScore,
        riskLevel: scoreToRiskLevel(riskScore),
        status: insightStatus(findings, asset),
        likelyVulnerable: riskScore >= 70,
        sourceCount: asset.sources.length,
        sources: asset.sources,
        lastSeen: asset.lastSeen,
      } satisfies ReconInsight;
    });
    const ipInsights = base.ipAddresses.map((ip) => {
      const findings = buildIpFindings(ip);
      const techStack = uniqueTechStack(ip.cpes.map(buildTechFromCpe));
      const riskScore = Math.min(100, 8 + scoreFindings(findings));

      return {
        id: `ip:${ip.address}`,
        label: ip.address,
        assetType: "ip",
        ipAddress: ip.address,
        hostnames: ip.hostnames,
        ipAddresses: [ip.address],
        openPorts: ip.openPorts,
        linkedServiceLabels: techStack.map((technology) => technology.name),
        techStack,
        findings,
        whereToLook: buildWhereToLook(findings),
        riskScore,
        riskLevel: scoreToRiskLevel(riskScore),
        status: insightStatus(findings, ip),
        likelyVulnerable: riskScore >= 70,
        sourceCount: ip.sources.length,
        sources: ip.sources,
      } satisfies ReconInsight;
    });
    const allInsights = sortInsights([...domainInsights, ...ipInsights], base.query.filters.sort);
    const filteredInsights = applyFilters(allInsights, base.query);
    const limitedInsights =
      typeof base.query.filters.limit === "number"
        ? filteredInsights.slice(0, base.query.filters.limit)
        : filteredInsights;
    const graph = buildGraph(limitedInsights, base.organization, base.websiteProfile);
    const highProbabilityTargets = limitedInsights.filter((insight) => insight.riskScore >= 70).slice(0, 5);
    const suggestions = Array.from(
      new Set(
        highProbabilityTargets.flatMap((insight) =>
          insight.whereToLook.map((suggestion) => `${insight.label}: ${suggestion.title}`),
        ),
      ),
    ).slice(0, 6);

    return {
      ...base,
      insights: limitedInsights,
      highProbabilityTargets,
      graph,
      suggestions,
      filtersApplied: base.query.recognizedFilters,
      stats: {
        ...base.stats,
        insightCount: limitedInsights.length,
        highProbabilityCount: highProbabilityTargets.length,
      },
    };
  }
}
