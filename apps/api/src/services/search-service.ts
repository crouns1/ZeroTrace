import { config } from "../config.js";
import { parseQuery } from "../lib/query.js";
import { CertSpotterSource } from "../sources/certspotter-source.js";
import { GoogleDnsSource } from "../sources/dns-source.js";
import { ExternalOsintSource } from "../sources/external-osint-source.js";
import { InternetDbSource } from "../sources/internetdb-source.js";
import { WebsiteProfileSource } from "../sources/website-profile-source.js";
import type {
  DomainAsset,
  ExternalIntelProfile,
  IpAsset,
  OrganizationPage,
  OrganizationProfile,
  OsintCoverageSignal,
  OsintTracker,
  OsintTrackerItem,
  OsintTrackerSection,
  PublicPerson,
  ReconPipeline,
  ReconPipelineStage,
  RelatedAsset,
  SearchPerformance,
  SearchResponse,
  SearchSource,
  SourceResult,
  WebsiteProfile,
} from "../types.js";
import { createCacheProvider, type CacheProvider } from "./cache-provider.js";
import { EnrichmentWorker } from "./enrichment-worker.js";
import { IntelligenceService } from "./intelligence-service.js";

interface SearchOptions {
  jobProviderName?: string;
  mode?: "sync" | "job";
  onProgress?: (progress: number, stage: string) => Promise<void> | void;
}

class PipelineTracker {
  private readonly stages: ReconPipelineStage[] = [
    {
      id: "surface",
      label: "Surface discovery",
      description: "Passive domain, subdomain, DNS, and website source collection.",
      status: "pending",
      itemsDiscovered: 0,
    },
    {
      id: "enrichment",
      label: "Passive enrichment",
      description: "Resolve IPs, ports, services, and public web artifacts.",
      status: "pending",
      itemsDiscovered: 0,
    },
    {
      id: "intelligence",
      label: "Intelligence scoring",
      description: "Calculate risk, prioritize likely targets, and assemble the graph.",
      status: "pending",
      itemsDiscovered: 0,
    },
  ];

  start(stageId: string): void {
    const stage = this.stages.find((item) => item.id === stageId);

    if (!stage) {
      return;
    }

    stage.status = "running";
    stage.startedAt = new Date().toISOString();
  }

  complete(stageId: string, itemsDiscovered: number): void {
    const stage = this.stages.find((item) => item.id === stageId);

    if (!stage) {
      return;
    }

    stage.status = "completed";
    stage.itemsDiscovered = itemsDiscovered;
    stage.completedAt = new Date().toISOString();
    stage.durationMs =
      stage.startedAt && stage.completedAt
        ? new Date(stage.completedAt).getTime() - new Date(stage.startedAt).getTime()
        : undefined;
  }

  fail(stageId: string): void {
    const stage = this.stages.find((item) => item.id === stageId);

    if (!stage) {
      return;
    }

    stage.status = "failed";
    stage.completedAt = new Date().toISOString();
  }

  snapshot(mode: ReconPipeline["mode"], status: ReconPipeline["status"]): ReconPipeline {
    return {
      mode,
      status,
      stages: this.stages,
    };
  }
}

function mergeDomainAssets(target: Map<string, DomainAsset>, assets: DomainAsset[]): void {
  for (const asset of assets) {
    const existing = target.get(asset.hostname);

    if (!existing) {
      target.set(asset.hostname, {
        ...asset,
        sources: [...asset.sources],
        ipAddresses: [...asset.ipAddresses],
        cnameTargets: [...asset.cnameTargets],
      });
      continue;
    }

    existing.kind = asset.kind;
    existing.sources = Array.from(new Set([...existing.sources, ...asset.sources]));
    existing.ipAddresses = Array.from(new Set([...existing.ipAddresses, ...asset.ipAddresses]));
    existing.cnameTargets = Array.from(new Set([...existing.cnameTargets, ...asset.cnameTargets]));
    existing.dnsStatus = existing.dnsStatus === "resolved" ? existing.dnsStatus : asset.dnsStatus;
    existing.httpStatus = existing.httpStatus ?? asset.httpStatus;
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
        cpes: [...asset.cpes],
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
    existing.cpes = Array.from(new Set([...existing.cpes, ...asset.cpes]));
  }
}

function mergeOrganization(
  current: OrganizationProfile | null,
  next: OrganizationProfile | undefined,
): OrganizationProfile | null {
  if (!next) {
    return current;
  }

  if (!current) {
    return {
      ...next,
      emails: [...next.emails],
      phones: [...next.phones],
      socialLinks: [...next.socialLinks],
      relevantPages: [...next.relevantPages],
      people: [...next.people],
      sources: [...next.sources],
    };
  }

  return {
    website: current.website || next.website,
    name: current.name ?? next.name,
    summary: current.summary ?? next.summary,
    description: current.description ?? next.description,
    foundedYear: current.foundedYear ?? next.foundedYear,
    earliestArchiveYear: current.earliestArchiveYear ?? next.earliestArchiveYear,
    location: current.location ?? next.location,
    generator: current.generator ?? next.generator,
    emails: Array.from(new Set([...current.emails, ...next.emails])),
    phones: Array.from(new Set([...current.phones, ...next.phones])),
    socialLinks: Array.from(new Set([...current.socialLinks, ...next.socialLinks])),
    relevantPages: Array.from(
      new Map(
        [...current.relevantPages, ...next.relevantPages].map((page) => [`${page.label}:${page.url}`, page]),
      ).values(),
    ),
    people: Array.from(
      new Map(
        [...current.people, ...next.people].map((person) => [
          `${person.name.toLowerCase()}:${(person.role ?? "").toLowerCase()}`,
          person,
        ]),
      ).values(),
    ).slice(0, 24),
    sources: Array.from(new Set([...current.sources, ...next.sources])),
  };
}

function mergeWebsiteProfile(
  current: WebsiteProfile | null,
  next: WebsiteProfile | undefined,
): WebsiteProfile | null {
  if (!next) {
    return current;
  }

  if (!current) {
    return {
      ...next,
      titles: [...next.titles],
      techStack: [...next.techStack],
      endpoints: [...next.endpoints],
      securityHeaders: [...next.securityHeaders],
      sources: [...next.sources],
    };
  }

  return {
    baseUrl: current.baseUrl || next.baseUrl,
    finalUrl: current.finalUrl ?? next.finalUrl,
    statusCode: current.statusCode ?? next.statusCode,
    server: current.server ?? next.server,
    poweredBy: current.poweredBy ?? next.poweredBy,
    titles: Array.from(new Set([...current.titles, ...next.titles])),
    techStack: Array.from(
      new Map([...current.techStack, ...next.techStack].map((item) => [`${item.name}:${item.source}`, item])).values(),
    ),
    endpoints: Array.from(
      new Map([...current.endpoints, ...next.endpoints].map((item) => [item.url, item])).values(),
    ),
    securityHeaders: next.securityHeaders.length > 0 ? next.securityHeaders : current.securityHeaders,
    sources: Array.from(new Set([...current.sources, ...next.sources])),
  };
}

function mergeExternalProfiles(
  current: ExternalIntelProfile[],
  next: ExternalIntelProfile[] | undefined,
): ExternalIntelProfile[] {
  if (!next || next.length === 0) {
    return current;
  }

  const merged = new Map<string, ExternalIntelProfile>(current.map((profile) => [profile.id, profile]));

  for (const profile of next) {
    const existing = merged.get(profile.id);

    if (!existing) {
      merged.set(profile.id, {
        ...profile,
        aliases: [...profile.aliases],
        facts: [...profile.facts],
        people: [...profile.people],
        links: [...profile.links],
        notes: [...profile.notes],
      });
      continue;
    }

    existing.description = existing.description ?? profile.description;
    existing.summary = existing.summary ?? profile.summary;
    existing.website = existing.website ?? profile.website;
    existing.confidence =
      existing.confidence === "high" || profile.confidence === "low" ? existing.confidence : profile.confidence;
    existing.aliases = Array.from(new Set([...existing.aliases, ...profile.aliases]));
    existing.facts = Array.from(
      new Map(
        [...existing.facts, ...profile.facts].map((fact) => [`${fact.label.toLowerCase()}:${fact.value.toLowerCase()}`, fact]),
      ).values(),
    );
    existing.people = Array.from(
      new Map(
        [...existing.people, ...profile.people].map((person) => [
          `${person.name.toLowerCase()}:${(person.role ?? "").toLowerCase()}`,
          person,
        ]),
      ).values(),
    );
    existing.links = Array.from(new Map([...existing.links, ...profile.links].map((link) => [link.url, link])).values());
    existing.notes = Array.from(new Set([...existing.notes, ...profile.notes]));
  }

  return Array.from(merged.values()).sort((left, right) => left.name.localeCompare(right.name));
}

function cloneTrackerItem(item: OsintTrackerItem): OsintTrackerItem {
  return { ...item };
}

function cloneTrackerSection(section: OsintTrackerSection): OsintTrackerSection {
  return {
    ...section,
    items: section.items.map(cloneTrackerItem),
  };
}

function cloneCoverageSignal(signal: OsintCoverageSignal): OsintCoverageSignal {
  return { ...signal };
}

function cloneOsintTracker(tracker: OsintTracker): OsintTracker {
  return {
    ...tracker,
    highlights: [...tracker.highlights],
    sections: tracker.sections.map(cloneTrackerSection),
    coverage: tracker.coverage.map(cloneCoverageSignal),
    notes: [...tracker.notes],
  };
}

function mergeOsintTracker(current: OsintTracker | null, next: OsintTracker | undefined): OsintTracker | null {
  if (!next) {
    return current;
  }

  if (!current) {
    return cloneOsintTracker(next);
  }

  const merged = cloneOsintTracker(current);
  const sections = new Map<string, OsintTrackerSection>(merged.sections.map((section) => [section.id, section]));

  for (const section of next.sections) {
    const existing = sections.get(section.id);

    if (!existing) {
      sections.set(section.id, cloneTrackerSection(section));
      continue;
    }

    existing.title = existing.title || section.title;
    existing.description = existing.description || section.description;
    existing.items = Array.from(
      new Map(
        [...existing.items, ...section.items].map((item) => [
          `${item.label.toLowerCase()}:${item.value.toLowerCase()}:${item.source.toLowerCase()}`,
          cloneTrackerItem(item),
        ]),
      ).values(),
    );
  }

  merged.target = merged.target || next.target;
  merged.sections = Array.from(sections.values());
  merged.coverage = Array.from(
    new Map(
      [...merged.coverage, ...next.coverage].map((signal) => [
        `${signal.source.toLowerCase()}:${signal.label.toLowerCase()}`,
        cloneCoverageSignal(signal),
      ]),
    ).values(),
  );
  merged.highlights = Array.from(new Set([...merged.highlights, ...next.highlights]));
  merged.notes = Array.from(new Set([...merged.notes, ...next.notes]));
  return merged;
}

function normalizeTrackerHref(value: string): string | undefined {
  try {
    return new URL(value).toString();
  } catch {
    return undefined;
  }
}

function trackSection(
  tracker: OsintTracker,
  id: string,
  title: string,
  description: string,
): OsintTrackerSection {
  let section = tracker.sections.find((entry) => entry.id === id);

  if (!section) {
    section = {
      id,
      title,
      description,
      items: [],
    };
    tracker.sections.push(section);
  }

  return section;
}

function addTrackerItem(
  tracker: OsintTracker,
  sectionId: string,
  title: string,
  description: string,
  item: OsintTrackerItem,
): void {
  const section = trackSection(tracker, sectionId, title, description);
  const key = `${item.label.toLowerCase()}:${item.value.toLowerCase()}:${item.source.toLowerCase()}`;

  if (section.items.some((entry) => `${entry.label.toLowerCase()}:${entry.value.toLowerCase()}:${entry.source.toLowerCase()}` === key)) {
    return;
  }

  section.items.push(item);
}

function addTrackerHighlight(tracker: OsintTracker, value: string | undefined): void {
  if (!value) {
    return;
  }

  const normalized = value.trim();

  if (!normalized) {
    return;
  }

  if (!tracker.highlights.includes(normalized)) {
    tracker.highlights.push(normalized);
  }
}

function addCoverageSignal(tracker: OsintTracker, signal: OsintCoverageSignal): void {
  const key = `${signal.source.toLowerCase()}:${signal.label.toLowerCase()}`;

  if (tracker.coverage.some((entry) => `${entry.source.toLowerCase()}:${entry.label.toLowerCase()}` === key)) {
    return;
  }

  tracker.coverage.push(signal);
}

function addOrganizationPeople(tracker: OsintTracker, people: PublicPerson[], source: string): void {
  for (const person of people) {
    addTrackerItem(tracker, "people", "Public people", "Leadership, founders, or public team signals.", {
      id: `person:${person.name.toLowerCase()}:${(person.role ?? "public-profile").toLowerCase()}`,
      label: person.role ?? "Public profile",
      value: person.name,
      href: person.sourcePage,
      context: person.sourcePage ? "Linked from a public page or passive external source." : undefined,
      source,
      confidence: source === "website-profile" ? "high" : "medium",
    });
  }
}

function addOrganizationPages(tracker: OsintTracker, pages: OrganizationPage[], source: string): void {
  for (const page of pages) {
    addTrackerItem(tracker, "pages", "Relevant pages", "Contact, about, team, and organization pages worth reviewing.", {
      id: `page:${page.url}`,
      label: page.label,
      value: page.url,
      href: page.url,
      source,
      confidence: "high",
    });
  }
}

function augmentOsintTracker(
  current: OsintTracker | null,
  query: SearchResponse["query"],
  organization: OrganizationProfile | null,
  websiteProfile: WebsiteProfile | null,
  externalProfiles: ExternalIntelProfile[],
): OsintTracker | null {
  const hasSignals =
    Boolean(current) ||
    Boolean(organization) ||
    Boolean(websiteProfile) ||
    externalProfiles.length > 0;

  if (!hasSignals) {
    return null;
  }

  const tracker = current
    ? cloneOsintTracker(current)
    : {
        target: organization?.website ?? websiteProfile?.baseUrl ?? query.value,
        highlights: [],
        sections: [],
        coverage: [],
        notes: [],
      };

  tracker.target = tracker.target || organization?.website || websiteProfile?.baseUrl || query.value;

  if (organization) {
    addCoverageSignal(tracker, {
      id: "website-public-pages",
      label: "Website public pages",
      source: "website-profile",
      status: organization.people.length > 0 || organization.relevantPages.length > 0 ? "hit" : "partial",
      detail:
        organization.people.length > 0 || organization.relevantPages.length > 0
          ? "Parsed public organization pages, team pages, or contact pages from the target site."
          : "Website was reachable but published only limited organization metadata.",
    });

    if (organization.name) {
      addTrackerItem(tracker, "identity", "Identity", "Core identity and company metadata collected passively.", {
        id: "identity:name",
        label: "Name",
        value: organization.name,
        source: "website-profile",
        confidence: "high",
      });
    }

    addTrackerItem(tracker, "identity", "Identity", "Core identity and company metadata collected passively.", {
      id: "identity:website",
      label: "Website",
      value: organization.website,
      href: organization.website,
      source: "website-profile",
      confidence: "high",
    });

    if (organization.location) {
      addTrackerItem(tracker, "identity", "Identity", "Core identity and company metadata collected passively.", {
        id: "identity:location",
        label: "Location",
        value: organization.location,
        source: "website-profile",
        confidence: "medium",
      });
    }

    if (organization.foundedYear) {
      addTrackerItem(tracker, "identity", "Identity", "Core identity and company metadata collected passively.", {
        id: "identity:founded",
        label: "Founded signal",
        value: String(organization.foundedYear),
        source: "website-profile",
        confidence: "medium",
      });
      addTrackerHighlight(tracker, `Founding signal: ${organization.foundedYear}.`);
    }

    if (organization.earliestArchiveYear) {
      addTrackerItem(
        tracker,
        "infrastructure",
        "Archive and registration",
        "Historic and registration-oriented passive signals.",
        {
          id: "infrastructure:archive",
          label: "Earliest archive year",
          value: String(organization.earliestArchiveYear),
          source: "website-profile",
          confidence: "medium",
        },
      );
      addTrackerHighlight(tracker, `Archive coverage reaches back to ${organization.earliestArchiveYear}.`);
    }

    for (const email of organization.emails) {
      addTrackerItem(tracker, "contacts", "Contacts", "Public contact points and externally visible communications channels.", {
        id: `contact:email:${email.toLowerCase()}`,
        label: "Email",
        value: email,
        href: `mailto:${email}`,
        source: "website-profile",
        confidence: "high",
      });
    }

    for (const phone of organization.phones) {
      addTrackerItem(tracker, "contacts", "Contacts", "Public contact points and externally visible communications channels.", {
        id: `contact:phone:${phone.toLowerCase()}`,
        label: "Phone",
        value: phone,
        source: "website-profile",
        confidence: "medium",
      });
    }

    for (const link of organization.socialLinks) {
      addTrackerItem(tracker, "social", "Social and community", "Public social handles, reference links, and community presence.", {
        id: `social:${link}`,
        label: "Social profile",
        value: link,
        href: link,
        source: "website-profile",
        confidence: "high",
      });
    }

    addOrganizationPeople(tracker, organization.people, "website-profile");
    addOrganizationPages(tracker, organization.relevantPages, "website-profile");
  }

  if (websiteProfile) {
    addCoverageSignal(tracker, {
      id: "website-stack",
      label: "Website stack",
      source: "website-profile",
      status: websiteProfile.techStack.length > 0 || websiteProfile.endpoints.length > 0 ? "hit" : "partial",
      detail:
        websiteProfile.techStack.length > 0 || websiteProfile.endpoints.length > 0
          ? "Collected passive web stack markers and public endpoint hints from the target site."
          : "Website was reachable but yielded limited passive stack data.",
    });

    if (websiteProfile.finalUrl && websiteProfile.finalUrl !== websiteProfile.baseUrl) {
      addTrackerItem(tracker, "web", "Web footprint", "Public web routing and passive HTTP observations.", {
        id: "web:final-url",
        label: "Final URL",
        value: websiteProfile.finalUrl,
        href: websiteProfile.finalUrl,
        source: "website-profile",
        confidence: "high",
      });
    }

    if (websiteProfile.server) {
      addTrackerItem(tracker, "web", "Web footprint", "Public web routing and passive HTTP observations.", {
        id: "web:server",
        label: "Server header",
        value: websiteProfile.server,
        source: "website-profile",
        confidence: "medium",
      });
    }

    if (websiteProfile.poweredBy) {
      addTrackerItem(tracker, "web", "Web footprint", "Public web routing and passive HTTP observations.", {
        id: "web:powered-by",
        label: "X-Powered-By",
        value: websiteProfile.poweredBy,
        source: "website-profile",
        confidence: "medium",
      });
    }

    for (const title of websiteProfile.titles.slice(0, 4)) {
      addTrackerItem(tracker, "web", "Web footprint", "Public web routing and passive HTTP observations.", {
        id: `web:title:${title.toLowerCase()}`,
        label: "Page title",
        value: title,
        source: "website-profile",
        confidence: "medium",
      });
    }
  }

  for (const profile of externalProfiles) {
    if (profile.website) {
      addTrackerItem(tracker, "social", "Social and community", "Public social handles, reference links, and community presence.", {
        id: `profile:website:${profile.id}`,
        label: profile.kind === "company" ? "Official site" : "Personal site",
        value: profile.website,
        href: profile.website,
        source: profile.source,
        confidence: profile.confidence,
      });
    }

    for (const link of profile.links) {
      addTrackerItem(tracker, "social", "Social and community", "Public social handles, reference links, and community presence.", {
        id: `profile:link:${profile.id}:${link.url}`,
        label: link.label,
        value: link.url,
        href: normalizeTrackerHref(link.url),
        source: profile.source,
        confidence: profile.confidence,
      });
    }

    addOrganizationPeople(tracker, profile.people, profile.source);
  }

  const peopleCount = tracker.sections.find((section) => section.id === "people")?.items.length ?? 0;

  if (peopleCount > 0) {
    addTrackerHighlight(tracker, `${peopleCount} public people signals collected.`);
  }

  const contactCount = tracker.sections.find((section) => section.id === "contacts")?.items.length ?? 0;

  if (contactCount > 0) {
    addTrackerHighlight(tracker, `${contactCount} contact points or abuse channels exposed publicly.`);
  }

  tracker.sections = tracker.sections
    .map((section) => ({
      ...section,
      items: section.items.sort((left, right) => left.label.localeCompare(right.label) || left.value.localeCompare(right.value)),
    }))
    .sort((left, right) => left.title.localeCompare(right.title));
  tracker.highlights = tracker.highlights.slice(0, 6);
  tracker.notes = Array.from(new Set(tracker.notes));
  return tracker;
}

function buildPerformance(cacheProviderName: string, jobProviderName: string): SearchPerformance {
  return {
    cacheProvider: cacheProviderName,
    jobProvider: jobProviderName,
    indexingProvider: "in-memory index (Meilisearch-ready)",
  };
}

function buildResponse(
  results: SourceResult[],
  query: SearchResponse["query"],
  durationMs: number,
  pipeline: ReconPipeline,
  performance: SearchPerformance,
): SearchResponse {
  const domains = new Map<string, DomainAsset>();
  const subdomains = new Map<string, DomainAsset>();
  const ipAddresses = new Map<string, IpAsset>();
  const relatedAssets = new Map<string, RelatedAsset>();
  let organization: OrganizationProfile | null = null;
  let websiteProfile: WebsiteProfile | null = null;
  let externalProfiles: ExternalIntelProfile[] = [];
  let osintTracker: OsintTracker | null = null;
  const notes = new Set<string>();
  const sources = new Set<string>();

  for (const result of results) {
    sources.add(result.source);
    mergeDomainAssets(domains, result.domains ?? []);
    mergeDomainAssets(subdomains, result.subdomains ?? []);
    mergeIpAssets(ipAddresses, result.ipAddresses ?? []);
    organization = mergeOrganization(organization, result.organization);
    websiteProfile = mergeWebsiteProfile(websiteProfile, result.websiteProfile);
    externalProfiles = mergeExternalProfiles(externalProfiles, result.externalProfiles);
    osintTracker = mergeOsintTracker(osintTracker, result.osintTracker);

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
  const finalOsintTracker = augmentOsintTracker(osintTracker, query, organization, websiteProfile, externalProfiles);
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
    organization,
    websiteProfile,
    externalProfiles,
    osintTracker: finalOsintTracker,
    insights: [],
    highProbabilityTargets: [],
    openPorts,
    relatedAssets: finalRelatedAssets,
    sources: Array.from(sources).sort(),
    notes: Array.from(notes),
    graph: {
      nodes: [],
      edges: [],
    },
    pipeline,
    suggestions: [],
    filtersApplied: query.recognizedFilters,
    stats: {
      domainCount: finalDomains.length,
      subdomainCount: finalSubdomains.length,
      ipCount: finalIps.length,
      peopleCount: Array.from(
        new Set([
          ...(organization?.people.map((person) => `${person.name}:${person.role ?? ""}`) ?? []),
          ...externalProfiles.flatMap((profile) => profile.people.map((person) => `${person.name}:${person.role ?? ""}`)),
        ]),
      ).length,
      portCount: openPorts.length,
      relatedAssetCount: finalRelatedAssets.length,
      insightCount: 0,
      highProbabilityCount: 0,
    },
    metadata: {
      cached: false,
      durationMs,
      disclaimer: config.disclaimer,
    },
    performance,
    exportFormats: ["json", "csv"],
  };
}

function buildEmptyResponse(
  query: SearchResponse["query"],
  durationMs: number,
  notes: string[],
  performance: SearchPerformance,
): SearchResponse {
  return {
    query,
    domains: [],
    subdomains: [],
    ipAddresses: [],
    organization: null,
    websiteProfile: null,
    externalProfiles: [],
    osintTracker: null,
    insights: [],
    highProbabilityTargets: [],
    openPorts: [],
    relatedAssets: [],
    sources: [],
    notes,
    graph: {
      nodes: [],
      edges: [],
    },
    pipeline: {
      mode: "sync",
      status: "failed",
      stages: [],
    },
    suggestions: [],
    filtersApplied: query.recognizedFilters,
    stats: {
      domainCount: 0,
      subdomainCount: 0,
      ipCount: 0,
      peopleCount: 0,
      portCount: 0,
      relatedAssetCount: 0,
      insightCount: 0,
      highProbabilityCount: 0,
    },
    metadata: {
      cached: false,
      durationMs,
      disclaimer: config.disclaimer,
    },
    performance,
    exportFormats: ["json", "csv"],
  };
}

export class SearchService {
  private readonly cacheProvider: CacheProvider<SearchResponse> = createCacheProvider<SearchResponse>();
  private readonly dnsSource = new GoogleDnsSource();
  private readonly internetDbSource = new InternetDbSource();
  private readonly sources: SearchSource[] = [
    new CertSpotterSource(),
    new WebsiteProfileSource(),
    new ExternalOsintSource(),
    this.dnsSource,
    this.internetDbSource,
  ];
  private readonly enrichmentWorker = new EnrichmentWorker(this.dnsSource, this.internetDbSource);
  private readonly intelligenceService = new IntelligenceService();

  getCacheProviderName(): string {
    return this.cacheProvider.name;
  }

  async search(rawQuery: string, options: SearchOptions = {}): Promise<SearchResponse> {
    const parsedQuery = parseQuery(rawQuery);
    const cacheKey = parsedQuery.raw.toLowerCase();
    const jobProviderName = options.jobProviderName ?? "memory-worker";
    const performance = buildPerformance(this.cacheProvider.name, jobProviderName);
    const cached = await this.cacheProvider.get(cacheKey);

    if (cached) {
      return {
        ...cached,
        metadata: {
          ...cached.metadata,
          cached: true,
        },
        performance,
      };
    }

    const startedAt = Date.now();
    const pipelineTracker = new PipelineTracker();
    const mode = options.mode ?? "sync";
    const notify = async (progress: number, stage: string) => {
      if (options.onProgress) {
        await options.onProgress(progress, stage);
      }
    };

    try {
      pipelineTracker.start("surface");
      await notify(20, "Surface discovery");
      const baseSources = this.sources.filter((source) => source.supports(parsedQuery));

      if (baseSources.length === 0) {
        return buildEmptyResponse(parsedQuery, Date.now() - startedAt, [
          "No source adapter matched this query. Try domain:, subdomain:, ip:, company:, person:, port:, risk:, or tech: filters.",
        ], performance);
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
      const baseItemCount = collected.reduce(
        (total, item) =>
          total +
          (item.domains?.length ?? 0) +
          (item.subdomains?.length ?? 0) +
          (item.ipAddresses?.length ?? 0) +
          (item.externalProfiles?.length ?? 0) +
          (item.relatedAssets?.length ?? 0),
        0,
      );
      pipelineTracker.complete("surface", baseItemCount);

      pipelineTracker.start("enrichment");
      await notify(55, "Passive enrichment");
      const interimResponse = buildResponse(
        collected,
        parsedQuery,
        Date.now() - startedAt,
        pipelineTracker.snapshot(mode, "running"),
        performance,
      );
      const enrichmentResults = await this.enrichmentWorker.enrich(interimResponse);
      pipelineTracker.complete(
        "enrichment",
        enrichmentResults.reduce(
          (total, item) =>
            total +
            (item.domains?.length ?? 0) +
            (item.subdomains?.length ?? 0) +
            (item.ipAddresses?.length ?? 0) +
            (item.externalProfiles?.length ?? 0) +
            (item.relatedAssets?.length ?? 0),
          0,
        ),
      );

      pipelineTracker.start("intelligence");
      await notify(85, "Risk scoring and graph correlation");
      const response = buildResponse(
        [...collected, ...enrichmentResults],
        parsedQuery,
        Date.now() - startedAt,
        pipelineTracker.snapshot(mode, "running"),
        performance,
      );

      if (sourceErrors.length > 0) {
        response.notes = Array.from(new Set([...response.notes, ...sourceErrors]));
      }

      const finalResponse = this.intelligenceService.buildResponse({
        ...response,
        pipeline: pipelineTracker.snapshot(mode, "running"),
      });
      pipelineTracker.complete("intelligence", finalResponse.insights.length);
      finalResponse.pipeline = pipelineTracker.snapshot(mode, "completed");
      finalResponse.metadata.durationMs = Date.now() - startedAt;

      await this.cacheProvider.set(cacheKey, finalResponse);
      await notify(100, "Completed");
      return finalResponse;
    } catch (error) {
      pipelineTracker.fail("intelligence");
      throw error;
    }
  }
}
