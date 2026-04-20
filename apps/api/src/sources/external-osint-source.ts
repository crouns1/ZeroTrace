import { fetchJson } from "../lib/http.js";
import { isDomainLike } from "../lib/query.js";
import type {
  ExternalIntelProfile,
  ExternalProfileFact,
  OrganizationPage,
  OsintCoverageSignal,
  OsintTracker,
  OsintTrackerItem,
  ParsedQuery,
  PublicPerson,
  SearchSource,
  SourceResult,
} from "../types.js";

interface WikidataSearchEntry {
  id: string;
  label?: string;
  description?: string;
  aliases?: string[];
}

interface WikidataSearchResponse {
  search?: WikidataSearchEntry[];
}

interface WikidataTextValue {
  value: string;
}

interface WikidataClaimValueEntity {
  id?: string;
}

interface WikidataClaimValueTime {
  time?: string;
}

interface WikidataClaimValueQuantity {
  amount?: string;
}

type WikidataClaimValue =
  | string
  | WikidataClaimValueEntity
  | WikidataClaimValueTime
  | WikidataClaimValueQuantity
  | Record<string, unknown>;

interface WikidataClaim {
  mainsnak?: {
    datavalue?: {
      value?: WikidataClaimValue;
    };
  };
}

interface WikidataEntity {
  id: string;
  labels?: Record<string, WikidataTextValue>;
  descriptions?: Record<string, WikidataTextValue>;
  aliases?: Record<string, WikidataTextValue[]>;
  claims?: Record<string, WikidataClaim[]>;
  sitelinks?: Record<string, { title?: string }>;
}

interface WikidataEntitiesResponse {
  entities?: Record<string, WikidataEntity>;
}

interface GitHubOrgResponse {
  login: string;
  html_url: string;
  description?: string | null;
  blog?: string | null;
  location?: string | null;
  name?: string | null;
  public_repos?: number;
  followers?: number;
}

interface GitHubUserResponse {
  login: string;
  html_url: string;
  blog?: string | null;
  bio?: string | null;
  location?: string | null;
  company?: string | null;
  followers?: number;
  public_repos?: number;
  name?: string | null;
  twitter_username?: string | null;
}

interface GitHubPublicMember {
  login: string;
  html_url: string;
  type?: string;
}

interface GitHubRepository {
  name: string;
  html_url: string;
  description?: string | null;
  language?: string | null;
  stargazers_count?: number;
  forks_count?: number;
  updated_at?: string;
}

interface GitHubOrgIntel {
  org: GitHubOrgResponse;
  members: GitHubPublicMember[];
  repos: GitHubRepository[];
}

interface GitHubUserIntel {
  user: GitHubUserResponse;
  repos: GitHubRepository[];
}

interface RdapResponse {
  ldhName?: string;
  unicodeName?: string;
  status?: string[];
  entities?: RdapEntity[];
  events?: RdapEvent[];
  nameservers?: Array<{
    ldhName?: string;
    unicodeName?: string;
  }>;
}

interface RdapEntity {
  handle?: string;
  roles?: string[];
  vcardArray?: [string, RdapVcardEntry[]];
}

type RdapVcardEntry = [string, Record<string, unknown>, string, unknown];

interface RdapEvent {
  eventAction?: string;
  eventDate?: string;
}

interface RdapContact {
  role: string;
  name?: string;
  organization?: string;
  emails: string[];
  phones: string[];
}

interface RdapIntel {
  domain: string;
  statuses: string[];
  nameservers: string[];
  registrationDate?: string;
  expirationDate?: string;
  lastChangedDate?: string;
  registrar?: string;
  contacts: RdapContact[];
}

interface HackerNewsSearchResponse {
  hits?: HackerNewsHit[];
  nbHits?: number;
}

interface HackerNewsHit {
  objectID: string;
  title?: string;
  story_title?: string;
  url?: string;
  created_at?: string;
  points?: number;
  num_comments?: number;
  author?: string;
}

const WIKIDATA_API = "https://www.wikidata.org/w/api.php";
const PROPERTY = {
  instanceOf: "P31",
  officialWebsite: "P856",
  inception: "P571",
  headquarters: "P159",
  country: "P17",
  industry: "P452",
  employees: "P1128",
  ceo: "P169",
  chairperson: "P488",
  foundedBy: "P112",
  github: "P2037",
  occupation: "P106",
  employer: "P108",
  positionHeld: "P39",
  citizenship: "P27",
} as const;
const COMPANY_INSTANCE_PATTERN =
  /\b(company|organization|business|corporation|enterprise|foundation|agency|university|brand|website|project|nonprofit|publisher|institute)\b/i;
const TRACKER_SECTIONS = {
  identity: {
    title: "Identity",
    description: "Names, aliases, legal facts, and public business metadata.",
  },
  people: {
    title: "People",
    description: "Leadership, public members, and public-facing contributors.",
  },
  social: {
    title: "Social and community",
    description: "Official references, profiles, and public communities.",
  },
  code: {
    title: "Code and packages",
    description: "Public source-control and software-distribution signals.",
  },
  infrastructure: {
    title: "Archive and registration",
    description: "Registration, nameserver, and domain-history signals.",
  },
  mentions: {
    title: "Public mentions",
    description: "Public discussion and visibility across public web sources.",
  },
  contacts: {
    title: "Contacts",
    description: "Public contact details or role-based response channels.",
  },
} as const;

function uniqueStrings(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.map((value) => value?.trim()).filter(Boolean) as string[]));
}

function uniquePeople(values: PublicPerson[]): PublicPerson[] {
  return Array.from(
    new Map(
      values.map((person) => [`${person.name.toLowerCase()}:${(person.role ?? "").toLowerCase()}`, person]),
    ).values(),
  );
}

function uniqueFacts(values: ExternalProfileFact[]): ExternalProfileFact[] {
  return Array.from(
    new Map(values.map((fact) => [`${fact.label.toLowerCase()}:${fact.value.toLowerCase()}`, fact])).values(),
  );
}

function uniquePages(values: OrganizationPage[]): OrganizationPage[] {
  return Array.from(new Map(values.map((page) => [page.url, page])).values());
}

function toLabel(entity?: WikidataEntity): string | undefined {
  return entity?.labels?.en?.value;
}

function toDescription(entity?: WikidataEntity): string | undefined {
  return entity?.descriptions?.en?.value;
}

function getClaims(entity: WikidataEntity, propertyId: string): WikidataClaim[] {
  return entity.claims?.[propertyId] ?? [];
}

function getClaimValue(claim: WikidataClaim): WikidataClaimValue | undefined {
  return claim.mainsnak?.datavalue?.value;
}

function getStringValues(entity: WikidataEntity, propertyId: string): string[] {
  return getClaims(entity, propertyId)
    .map(getClaimValue)
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);
}

function getEntityIds(entity: WikidataEntity, propertyId: string): string[] {
  return getClaims(entity, propertyId)
    .map(getClaimValue)
    .map((value) => (typeof value === "object" && value && "id" in value ? value.id : undefined))
    .filter((value): value is string => Boolean(value));
}

function getYear(entity: WikidataEntity, propertyId: string): number | undefined {
  for (const claim of getClaims(entity, propertyId)) {
    const value = getClaimValue(claim);

    if (typeof value === "object" && value && "time" in value && typeof value.time === "string") {
      const match = value.time.match(/[+-](\d{4})-/);

      if (match?.[1]) {
        return Number(match[1]);
      }
    }
  }

  return undefined;
}

function getQuantity(entity: WikidataEntity, propertyId: string): number | undefined {
  for (const claim of getClaims(entity, propertyId)) {
    const value = getClaimValue(claim);

    if (typeof value === "object" && value && "amount" in value && typeof value.amount === "string") {
      const parsed = Number.parseFloat(value.amount);

      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return undefined;
}

function labelForEntityId(entityId: string, entities: Map<string, WikidataEntity>): string | undefined {
  return toLabel(entities.get(entityId));
}

function createWikipediaPageLink(title?: string): string | undefined {
  if (!title) {
    return undefined;
  }

  return `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/\s+/g, "_"))}`;
}

function inferSearchHint(query: ParsedQuery): "company" | "person" | undefined {
  if (query.operator === "company" || query.filters.company) {
    return "company";
  }

  if (query.operator === "person" || query.filters.person) {
    return "person";
  }

  if (query.operator === "domain" || query.operator === "subdomain") {
    return "company";
  }

  return undefined;
}

function stripOperatorPrefix(raw: string, operator: "company" | "person"): string | undefined {
  const prefix = `${operator}:`;

  if (!raw.toLowerCase().startsWith(prefix)) {
    return undefined;
  }

  const value = raw.slice(prefix.length).trim();
  return value || undefined;
}

function toBaseDomain(value: string): string {
  const labels = value.toLowerCase().split(".").filter(Boolean);

  if (labels.length <= 2) {
    return value.toLowerCase();
  }

  return labels.slice(-2).join(".");
}

function getQueryTargetDomain(query: ParsedQuery): string | undefined {
  if ((query.operator === "domain" || query.operator === "subdomain") && isDomainLike(query.value)) {
    return toBaseDomain(query.value);
  }

  if (query.filters.domain) {
    return toBaseDomain(query.filters.domain);
  }

  if (query.filters.subdomain) {
    return toBaseDomain(query.filters.subdomain);
  }

  return undefined;
}

function getSearchTerm(query: ParsedQuery): string {
  const explicitCompany = stripOperatorPrefix(query.raw, "company");
  const explicitPerson = stripOperatorPrefix(query.raw, "person");

  if (query.operator === "company" && explicitCompany) {
    return explicitCompany;
  }

  if (query.operator === "person" && explicitPerson) {
    return explicitPerson;
  }

  if (query.filters.company) {
    return query.filters.company;
  }

  if (query.filters.person) {
    return query.filters.person;
  }

  if ((query.operator === "domain" || query.operator === "subdomain") && isDomainLike(query.value)) {
    const labels = query.value.toLowerCase().split(".");
    return labels.length >= 2 ? labels[labels.length - 2] ?? query.value : query.value;
  }

  return query.raw.trim();
}

function isHuman(entity: WikidataEntity): boolean {
  return getEntityIds(entity, PROPERTY.instanceOf).includes("Q5");
}

function classifyEntity(entity: WikidataEntity, labels: Map<string, WikidataEntity>): "company" | "person" | null {
  if (isHuman(entity)) {
    return "person";
  }

  const instanceLabels = getEntityIds(entity, PROPERTY.instanceOf)
    .map((entityId) => labelForEntityId(entityId, labels))
    .filter((value): value is string => Boolean(value));

  if (instanceLabels.some((value) => COMPANY_INSTANCE_PATTERN.test(value))) {
    return "company";
  }

  if (
    getQuantity(entity, PROPERTY.employees) !== undefined ||
    getEntityIds(entity, PROPERTY.headquarters).length > 0 ||
    getEntityIds(entity, PROPERTY.ceo).length > 0 ||
    getEntityIds(entity, PROPERTY.chairperson).length > 0
  ) {
    return "company";
  }

  if (getEntityIds(entity, PROPERTY.occupation).length > 0 || getEntityIds(entity, PROPERTY.employer).length > 0) {
    return "person";
  }

  return null;
}

function hostMatchesTarget(urlValue: string | undefined, targetDomain: string): boolean {
  if (!urlValue) {
    return false;
  }

  try {
    const hostname = new URL(urlValue).hostname.toLowerCase();
    return hostname === targetDomain || hostname.endsWith(`.${targetDomain}`);
  } catch {
    return false;
  }
}

function extractGitHubOrg(urlValue?: string): string | undefined {
  if (!urlValue) {
    return undefined;
  }

  try {
    const parsed = new URL(urlValue);

    if (!/^(www\.)?github\.com$/i.test(parsed.hostname)) {
      return undefined;
    }

    const firstSegment = parsed.pathname.split("/").filter(Boolean)[0];

    if (!firstSegment) {
      return undefined;
    }

    if (["orgs", "users", "features", "pricing", "topics"].includes(firstSegment.toLowerCase())) {
      return undefined;
    }

    return firstSegment;
  } catch {
    return undefined;
  }
}

function toConfidence(
  profile: ExternalIntelProfile,
  query: ParsedQuery,
  targetDomain?: string,
): ExternalIntelProfile["confidence"] {
  if (targetDomain && hostMatchesTarget(profile.website, targetDomain)) {
    return "high";
  }

  if (profile.name.toLowerCase() === query.value.toLowerCase()) {
    return "high";
  }

  if (profile.aliases.some((alias) => alias.toLowerCase() === query.value.toLowerCase())) {
    return "high";
  }

  return profile.website ? "medium" : "low";
}

function formatEmployeeCount(value: number | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return value.toLocaleString("en-US");
}

function scoreProfile(profile: ExternalIntelProfile, query: ParsedQuery, targetDomain?: string): number {
  let score = 0;
  const normalizedQuery = query.value.toLowerCase();
  const normalizedName = profile.name.toLowerCase();

  if (targetDomain && hostMatchesTarget(profile.website, targetDomain)) {
    score += 100;
  }

  if (normalizedName === normalizedQuery) {
    score += 50;
  } else if (normalizedName.includes(normalizedQuery)) {
    score += 20;
  }

  if (profile.aliases.some((alias) => alias.toLowerCase() === normalizedQuery)) {
    score += 30;
  } else if (profile.aliases.some((alias) => alias.toLowerCase().includes(normalizedQuery))) {
    score += 10;
  }

  if (profile.kind === "company") {
    score += profile.people.length * 2;
  }

  score += profile.facts.length;

  if (profile.confidence === "high") {
    score += 20;
  } else if (profile.confidence === "medium") {
    score += 10;
  }

  return score;
}

function buildCompanySummary(
  description: string | undefined,
  foundedYear: number | undefined,
  headquarters: string | undefined,
  employeeCount: number | undefined,
  peopleCount: number,
): string {
  const parts: string[] = [];

  if (description) {
    parts.push(description);
  }

  if (foundedYear) {
    parts.push(`Founded in ${foundedYear}.`);
  }

  if (headquarters) {
    parts.push(`Headquartered in ${headquarters}.`);
  }

  if (employeeCount !== undefined) {
    parts.push(`Reported employee count: ${formatEmployeeCount(employeeCount)}.`);
  }

  if (peopleCount > 0) {
    parts.push(`Includes public leadership or public developer-profile signals.`);
  }

  return parts.join(" ");
}

function buildPersonSummary(
  description: string | undefined,
  occupations: string[],
  employers: string[],
  positions: string[],
): string {
  const parts: string[] = [];

  if (description) {
    parts.push(description);
  }

  if (occupations.length > 0) {
    parts.push(`Occupation: ${occupations.join(", ")}.`);
  }

  if (employers.length > 0) {
    parts.push(`Employer: ${employers.join(", ")}.`);
  }

  if (positions.length > 0) {
    parts.push(`Public positions: ${positions.join(", ")}.`);
  }

  return parts.join(" ");
}

function createTracker(target: string): OsintTracker {
  return {
    target,
    highlights: [],
    sections: [],
    coverage: [],
    notes: [],
  };
}

function ensureTrackerSection(tracker: OsintTracker, id: keyof typeof TRACKER_SECTIONS) {
  let section = tracker.sections.find((entry) => entry.id === id);

  if (!section) {
    const template = TRACKER_SECTIONS[id];
    section = {
      id,
      title: template.title,
      description: template.description,
      items: [],
    };
    tracker.sections.push(section);
  }

  return section;
}

function addTrackerItem(tracker: OsintTracker, sectionId: keyof typeof TRACKER_SECTIONS, item: OsintTrackerItem): void {
  const section = ensureTrackerSection(tracker, sectionId);
  const key = `${item.label.toLowerCase()}:${item.value.toLowerCase()}:${item.source.toLowerCase()}`;

  if (section.items.some((entry) => `${entry.label.toLowerCase()}:${entry.value.toLowerCase()}:${entry.source.toLowerCase()}` === key)) {
    return;
  }

  section.items.push(item);
}

function addTrackerCoverage(tracker: OsintTracker, signal: OsintCoverageSignal): void {
  const key = `${signal.source.toLowerCase()}:${signal.label.toLowerCase()}`;

  if (tracker.coverage.some((entry) => `${entry.source.toLowerCase()}:${entry.label.toLowerCase()}` === key)) {
    return;
  }

  tracker.coverage.push(signal);
}

function addTrackerHighlight(tracker: OsintTracker, value: string | undefined): void {
  if (!value) {
    return;
  }

  const normalized = value.trim();

  if (!normalized || tracker.highlights.includes(normalized)) {
    return;
  }

  tracker.highlights.push(normalized);
}

function addTrackerNote(tracker: OsintTracker, value: string | undefined): void {
  if (!value) {
    return;
  }

  const normalized = value.trim();

  if (!normalized || tracker.notes.includes(normalized)) {
    return;
  }

  tracker.notes.push(normalized);
}

function mapFactToTrackerSection(label: string): keyof typeof TRACKER_SECTIONS {
  const normalized = label.toLowerCase();

  if (normalized.includes("github") || normalized.includes("repo") || normalized.includes("follower")) {
    return "code";
  }

  if (normalized.includes("employer") || normalized.includes("position") || normalized.includes("occupation")) {
    return "people";
  }

  return "identity";
}

function normalizeDate(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  return parsed.toISOString().slice(0, 10);
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function parseVcardString(entry: RdapVcardEntry | undefined): string | undefined {
  const value = entry?.[3];
  return typeof value === "string" ? value.trim() : undefined;
}

function parseRdapContact(entity: RdapEntity): RdapContact {
  const roles = entity.roles ?? [];
  const entries = entity.vcardArray?.[1] ?? [];
  const emails = uniqueStrings(entries.filter((entry) => entry[0] === "email").map(parseVcardString));
  const phones = uniqueStrings(entries.filter((entry) => entry[0] === "tel").map(parseVcardString));
  const name = parseVcardString(entries.find((entry) => entry[0] === "fn"));
  const organization = parseVcardString(entries.find((entry) => entry[0] === "org"));

  return {
    role: roles[0] ?? "contact",
    name,
    organization,
    emails,
    phones,
  };
}

function parseRdapIntel(domain: string, payload: RdapResponse): RdapIntel {
  const contacts = (payload.entities ?? []).map(parseRdapContact);
  const registrar =
    contacts.find((contact) => contact.role.toLowerCase().includes("registrar"))?.organization ??
    contacts.find((contact) => contact.role.toLowerCase().includes("registrar"))?.name;

  return {
    domain,
    statuses: uniqueStrings(payload.status ?? []),
    nameservers: uniqueStrings(
      (payload.nameservers ?? []).map((entry) => entry.ldhName ?? entry.unicodeName).filter(Boolean),
    ),
    registrationDate: normalizeDate(
      payload.events?.find((event) => event.eventAction?.toLowerCase().includes("registration"))?.eventDate,
    ),
    expirationDate: normalizeDate(
      payload.events?.find((event) => event.eventAction?.toLowerCase().includes("expiration"))?.eventDate,
    ),
    lastChangedDate: normalizeDate(
      payload.events?.find((event) => event.eventAction?.toLowerCase().includes("last changed"))?.eventDate,
    ),
    registrar,
    contacts,
  };
}

function buildHackerNewsContext(hit: HackerNewsHit): string | undefined {
  const parts = [normalizeDate(hit.created_at), hit.points ? `${hit.points} points` : undefined, hit.num_comments ? `${hit.num_comments} comments` : undefined].filter(Boolean);
  return parts.join(" · ") || undefined;
}

async function searchWikidata(term: string): Promise<WikidataSearchEntry[]> {
  const params = new URLSearchParams({
    action: "wbsearchentities",
    format: "json",
    language: "en",
    type: "item",
    limit: "6",
    search: term,
  });

  const response = await fetchJson<WikidataSearchResponse>(`${WIKIDATA_API}?${params.toString()}`);
  return response.search ?? [];
}

async function fetchEntities(ids: string[]): Promise<Map<string, WikidataEntity>> {
  if (ids.length === 0) {
    return new Map();
  }

  const params = new URLSearchParams({
    action: "wbgetentities",
    format: "json",
    languages: "en",
    props: "labels|descriptions|aliases|claims|sitelinks",
    ids: ids.join("|"),
  });
  const response = await fetchJson<WikidataEntitiesResponse>(`${WIKIDATA_API}?${params.toString()}`);

  return new Map(Object.entries(response.entities ?? {}));
}

async function fetchGitHubOrgIntel(login: string): Promise<GitHubOrgIntel> {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const [org, members, repos] = await Promise.all([
    fetchJson<GitHubOrgResponse>(`https://api.github.com/orgs/${encodeURIComponent(login)}`, { headers }),
    fetchJson<GitHubPublicMember[]>(
      `https://api.github.com/orgs/${encodeURIComponent(login)}/public_members?per_page=10`,
      { headers },
    ),
    fetchJson<GitHubRepository[]>(
      `https://api.github.com/orgs/${encodeURIComponent(login)}/repos?type=public&sort=updated&per_page=6`,
      { headers },
    ),
  ]);

  return {
    org,
    members,
    repos,
  };
}

async function fetchGitHubUserIntel(login: string): Promise<GitHubUserIntel> {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const [user, repos] = await Promise.all([
    fetchJson<GitHubUserResponse>(`https://api.github.com/users/${encodeURIComponent(login)}`, { headers }),
    fetchJson<GitHubRepository[]>(
      `https://api.github.com/users/${encodeURIComponent(login)}/repos?type=owner&sort=updated&per_page=6`,
      { headers },
    ),
  ]);

  return {
    user,
    repos,
  };
}

async function fetchRdapIntel(domain: string): Promise<RdapIntel> {
  const payload = await fetchJson<RdapResponse>(`https://rdap.org/domain/${encodeURIComponent(domain)}`);
  return parseRdapIntel(domain, payload);
}

async function searchHackerNews(term: string): Promise<HackerNewsSearchResponse> {
  const params = new URLSearchParams({
    query: term,
    hitsPerPage: "4",
    tags: "story",
  });
  return fetchJson<HackerNewsSearchResponse>(`https://hn.algolia.com/api/v1/search?${params.toString()}`);
}

function buildRelatedAssets(profiles: ExternalIntelProfile[], sourceId: string): SourceResult["relatedAssets"] {
  const assets: NonNullable<SourceResult["relatedAssets"]> = [];

  for (const profile of profiles) {
    for (const person of profile.people.slice(0, 12)) {
      assets.push({
        kind: "person",
        value: person.name,
        relation: `${profile.kind} profile linked to ${profile.name}`,
        source: sourceId,
      });
    }

    if (profile.website) {
      try {
        const hostname = new URL(profile.website).hostname;
        assets.push({
          kind: "hostname",
          value: hostname,
          relation: `official website for ${profile.name}`,
          source: sourceId,
        });
      } catch {
        // Ignore malformed URLs from upstream data.
      }
    }
  }

  return assets;
}

function addProfileToTracker(tracker: OsintTracker, profile: ExternalIntelProfile): void {
  addTrackerItem(tracker, "identity", {
    id: `identity:profile:${profile.id}`,
    label: profile.kind === "company" ? "Company profile" : "Public profile",
    value: profile.name,
    href: profile.website,
    context: profile.description,
    source: profile.source,
    confidence: profile.confidence,
  });

  for (const alias of profile.aliases.slice(0, 6)) {
    addTrackerItem(tracker, "identity", {
      id: `identity:alias:${profile.id}:${alias.toLowerCase()}`,
      label: "Alias",
      value: alias,
      source: profile.source,
      confidence: profile.confidence,
    });
  }

  for (const fact of profile.facts) {
    addTrackerItem(tracker, mapFactToTrackerSection(fact.label), {
      id: `fact:${profile.id}:${fact.label.toLowerCase()}:${fact.value.toLowerCase()}`,
      label: fact.label,
      value: fact.value,
      href: fact.href,
      source: profile.source,
      confidence: profile.confidence,
    });
  }

  for (const person of profile.people) {
    addTrackerItem(tracker, "people", {
      id: `person:${profile.id}:${person.name.toLowerCase()}:${(person.role ?? "public-profile").toLowerCase()}`,
      label: person.role ?? "Public profile",
      value: person.name,
      href: person.sourcePage,
      source: profile.source,
      confidence: profile.confidence,
    });
  }

  for (const link of profile.links) {
    addTrackerItem(tracker, "social", {
      id: `social:${profile.id}:${link.url}`,
      label: link.label,
      value: link.url,
      href: link.url,
      source: profile.source,
      confidence: profile.confidence,
    });
  }
}

function enrichTrackerWithGitHubOrg(
  tracker: OsintTracker,
  intel: GitHubOrgIntel,
  profile: ExternalIntelProfile,
): {
  facts: ExternalProfileFact[];
  links: OrganizationPage[];
  people: PublicPerson[];
  notes: string[];
} {
  addTrackerCoverage(tracker, {
    id: "github-org",
    label: "GitHub public org",
    source: "github",
    status: intel.repos.length > 0 || intel.members.length > 0 ? "hit" : "partial",
    detail:
      intel.repos.length > 0 || intel.members.length > 0
        ? "GitHub organization profile, public members, and recent repositories were collected."
        : "GitHub organization profile was found, but member or repository visibility was limited.",
  });

  addTrackerItem(tracker, "code", {
    id: `github:org:${intel.org.login}`,
    label: "GitHub org",
    value: intel.org.login,
    href: intel.org.html_url,
    source: "github",
    confidence: "high",
  });

  if (intel.org.public_repos !== undefined) {
    addTrackerItem(tracker, "code", {
      id: `github:org:repos:${intel.org.login}`,
      label: "Public repos",
      value: intel.org.public_repos.toLocaleString("en-US"),
      source: "github",
      confidence: "high",
    });
    addTrackerHighlight(tracker, `GitHub exposes ${intel.org.public_repos.toLocaleString("en-US")} public repositories.`);
  }

  if (intel.org.followers !== undefined) {
    addTrackerItem(tracker, "social", {
      id: `github:org:followers:${intel.org.login}`,
      label: "GitHub followers",
      value: intel.org.followers.toLocaleString("en-US"),
      source: "github",
      confidence: "medium",
    });
  }

  for (const member of intel.members.filter((entry) => entry.type === "User" || entry.type === undefined).slice(0, 10)) {
    addTrackerItem(tracker, "people", {
      id: `github:member:${intel.org.login}:${member.login.toLowerCase()}`,
      label: "Public GitHub member",
      value: member.login,
      href: member.html_url,
      context: "Public org member visibility only; not a complete employee list.",
      source: "github",
      confidence: "medium",
    });
  }

  for (const repo of intel.repos.slice(0, 6)) {
    addTrackerItem(tracker, "code", {
      id: `github:repo:${intel.org.login}:${repo.name.toLowerCase()}`,
      label: "Recent repo",
      value: repo.name,
      href: repo.html_url,
      context: [repo.language, normalizeDate(repo.updated_at), repo.description ?? undefined].filter(Boolean).join(" · ") || undefined,
      source: "github",
      confidence: "high",
    });
  }

  const facts: ExternalProfileFact[] = [
    {
      label: "GitHub org",
      value: intel.org.login,
      href: intel.org.html_url,
    },
  ];

  if (intel.org.public_repos !== undefined) {
    facts.push({
      label: "Public repos",
      value: intel.org.public_repos.toLocaleString("en-US"),
    });
  }

  if (intel.org.followers !== undefined) {
    facts.push({
      label: "Followers",
      value: intel.org.followers.toLocaleString("en-US"),
    });
  }

  if (intel.org.location) {
    facts.push({
      label: "GitHub location",
      value: intel.org.location,
    });
  }

  const links: OrganizationPage[] = [
    {
      label: "GitHub org",
      url: intel.org.html_url,
    },
  ];

  if (intel.org.blog) {
    links.push({
      label: "GitHub blog",
      url: intel.org.blog,
    });
  }

  return {
    facts,
    links,
    people: uniquePeople(
      intel.members
        .filter((member) => member.type === "User" || member.type === undefined)
        .map((member) => ({
          name: member.login,
          role: "Public GitHub member",
          sourcePage: member.html_url,
        })),
    ),
    notes: [
      "GitHub public members are public org profiles and may not represent a complete employee list.",
      profile.kind === "company"
        ? "Recent repositories can reveal product names, internal tooling conventions, and exposed tech choices."
        : "GitHub visibility is public-profile only and should be treated as a lead, not an attribution guarantee.",
    ],
  };
}

function enrichTrackerWithGitHubUser(
  tracker: OsintTracker,
  intel: GitHubUserIntel,
): {
  facts: ExternalProfileFact[];
  links: OrganizationPage[];
  notes: string[];
} {
  addTrackerCoverage(tracker, {
    id: "github-user",
    label: "GitHub public user",
    source: "github",
    status: intel.repos.length > 0 ? "hit" : "partial",
    detail:
      intel.repos.length > 0
        ? "GitHub user profile and public repositories were collected."
        : "GitHub user profile was found, but repository visibility was limited.",
  });

  addTrackerItem(tracker, "social", {
    id: `github:user:${intel.user.login}`,
    label: "GitHub profile",
    value: intel.user.login,
    href: intel.user.html_url,
    source: "github",
    confidence: "high",
  });

  if (intel.user.company) {
    addTrackerItem(tracker, "people", {
      id: `github:user:company:${intel.user.login}`,
      label: "Public company",
      value: intel.user.company,
      source: "github",
      confidence: "medium",
    });
  }

  if (intel.user.location) {
    addTrackerItem(tracker, "identity", {
      id: `github:user:location:${intel.user.login}`,
      label: "GitHub location",
      value: intel.user.location,
      source: "github",
      confidence: "medium",
    });
  }

  if (intel.user.twitter_username) {
    addTrackerItem(tracker, "social", {
      id: `github:user:twitter:${intel.user.login}`,
      label: "Twitter / X",
      value: `https://x.com/${intel.user.twitter_username}`,
      href: `https://x.com/${intel.user.twitter_username}`,
      source: "github",
      confidence: "medium",
    });
  }

  for (const repo of intel.repos.slice(0, 6)) {
    addTrackerItem(tracker, "code", {
      id: `github:user:repo:${intel.user.login}:${repo.name.toLowerCase()}`,
      label: "Recent repo",
      value: repo.name,
      href: repo.html_url,
      context: [repo.language, normalizeDate(repo.updated_at), repo.description ?? undefined].filter(Boolean).join(" · ") || undefined,
      source: "github",
      confidence: "high",
    });
  }

  const facts: ExternalProfileFact[] = [];

  if (intel.user.company) {
    facts.push({
      label: "GitHub company",
      value: intel.user.company,
    });
  }

  if (intel.user.followers !== undefined) {
    facts.push({
      label: "Followers",
      value: intel.user.followers.toLocaleString("en-US"),
    });
  }

  if (intel.user.public_repos !== undefined) {
    facts.push({
      label: "Public repos",
      value: intel.user.public_repos.toLocaleString("en-US"),
    });
  }

  const links: OrganizationPage[] = [
    {
      label: "GitHub",
      url: intel.user.html_url,
    },
  ];

  if (intel.user.blog) {
    links.push({
      label: "GitHub blog",
      url: intel.user.blog,
    });
  }

  return {
    facts,
    links,
    notes: ["GitHub person enrichment is limited to the user's public profile and repositories."],
  };
}

function addRdapIntelToTracker(tracker: OsintTracker, intel: RdapIntel): void {
  addTrackerCoverage(tracker, {
    id: "rdap-domain",
    label: "RDAP domain record",
    source: "rdap",
    status: intel.nameservers.length > 0 || intel.statuses.length > 0 ? "hit" : "partial",
    detail:
      intel.nameservers.length > 0 || intel.statuses.length > 0
        ? "Domain registration, nameserver, and contact-role metadata were collected."
        : "Domain registration record was reachable, but exposed only sparse metadata.",
  });

  addTrackerItem(tracker, "infrastructure", {
    id: `rdap:domain:${intel.domain}`,
    label: "Domain",
    value: intel.domain,
    source: "rdap",
    confidence: "high",
  });

  if (intel.registrar) {
    addTrackerItem(tracker, "infrastructure", {
      id: `rdap:registrar:${intel.domain}`,
      label: "Registrar",
      value: intel.registrar,
      source: "rdap",
      confidence: "medium",
    });
  }

  if (intel.registrationDate) {
    addTrackerItem(tracker, "infrastructure", {
      id: `rdap:registered:${intel.domain}`,
      label: "Registered",
      value: intel.registrationDate,
      source: "rdap",
      confidence: "medium",
    });
    addTrackerHighlight(tracker, `Registration record dates back to ${intel.registrationDate}.`);
  }

  if (intel.expirationDate) {
    addTrackerItem(tracker, "infrastructure", {
      id: `rdap:expires:${intel.domain}`,
      label: "Expiration",
      value: intel.expirationDate,
      source: "rdap",
      confidence: "medium",
    });
  }

  if (intel.lastChangedDate) {
    addTrackerItem(tracker, "infrastructure", {
      id: `rdap:changed:${intel.domain}`,
      label: "Last changed",
      value: intel.lastChangedDate,
      source: "rdap",
      confidence: "medium",
    });
  }

  for (const status of intel.statuses.slice(0, 6)) {
    addTrackerItem(tracker, "infrastructure", {
      id: `rdap:status:${intel.domain}:${status.toLowerCase()}`,
      label: "RDAP status",
      value: status,
      source: "rdap",
      confidence: "medium",
    });
  }

  for (const nameserver of intel.nameservers.slice(0, 8)) {
    addTrackerItem(tracker, "infrastructure", {
      id: `rdap:nameserver:${intel.domain}:${nameserver.toLowerCase()}`,
      label: "Nameserver",
      value: nameserver,
      source: "rdap",
      confidence: "high",
    });
  }

  for (const contact of intel.contacts.slice(0, 6)) {
    const contactName = contact.organization ?? contact.name;

    if (contactName) {
      addTrackerItem(tracker, "identity", {
        id: `rdap:contact:${intel.domain}:${contact.role.toLowerCase()}:${contactName.toLowerCase()}`,
        label: `${contact.role} contact`,
        value: contactName,
        source: "rdap",
        confidence: "low",
      });
    }

    for (const email of contact.emails.slice(0, 2)) {
      addTrackerItem(tracker, "contacts", {
        id: `rdap:contact-email:${intel.domain}:${email.toLowerCase()}`,
        label: `${contact.role} email`,
        value: email,
        href: `mailto:${email}`,
        source: "rdap",
        confidence: "medium",
      });
    }

    for (const phone of contact.phones.slice(0, 2)) {
      addTrackerItem(tracker, "contacts", {
        id: `rdap:contact-phone:${intel.domain}:${phone.toLowerCase()}`,
        label: `${contact.role} phone`,
        value: phone,
        source: "rdap",
        confidence: "low",
      });
    }
  }
}

function addHackerNewsToTracker(tracker: OsintTracker, term: string, payload: HackerNewsSearchResponse): void {
  const hits = payload.hits ?? [];

  addTrackerCoverage(tracker, {
    id: "hacker-news",
    label: "Hacker News mentions",
    source: "hn-algolia",
    status: hits.length > 0 ? "hit" : "miss",
    detail:
      hits.length > 0
        ? `Found ${payload.nbHits?.toLocaleString("en-US") ?? hits.length} public discussion hits for ${term}.`
        : `No public Hacker News story hits were found for ${term}.`,
  });

  if (hits.length > 0) {
    addTrackerHighlight(
      tracker,
      `${payload.nbHits?.toLocaleString("en-US") ?? hits.length} public discussion hits found for ${term}.`,
    );
  }

  for (const hit of hits.slice(0, 4)) {
    const title = hit.title ?? hit.story_title ?? hit.url ?? `HN story ${hit.objectID}`;

    addTrackerItem(tracker, "mentions", {
      id: `hn:${hit.objectID}`,
      label: "Hacker News story",
      value: title,
      href: hit.url,
      context: buildHackerNewsContext(hit),
      source: "hn-algolia",
      confidence: "medium",
    });
  }
}

export class ExternalOsintSource implements SearchSource {
  readonly id = "external-osint";

  supports(query: ParsedQuery): boolean {
    return query.operator !== "ip";
  }

  async search(query: ParsedQuery): Promise<SourceResult> {
    const searchTerm = getSearchTerm(query);
    const explicitCompany = stripOperatorPrefix(query.raw, "company");
    const explicitPerson = stripOperatorPrefix(query.raw, "person");

    if (!searchTerm) {
      return {
        source: this.id,
        externalProfiles: [],
        notes: ["External OSINT search needs a company name, person name, or domain-oriented query."],
      };
    }

    const targetDomain = getQueryTargetDomain(query);
    const tracker = createTracker(targetDomain ?? searchTerm);
    const hint = inferSearchHint(query);
    const profiles: ExternalIntelProfile[] = [];
    const notes = new Set<string>();
    const githubLogins = new Map<string, { login: string; kind: "company" | "person" }>();
    let searchResults: WikidataSearchEntry[] = [];
    let entityMap = new Map<string, WikidataEntity>();
    let linkedEntityMap = new Map<string, WikidataEntity>();

    try {
      searchResults = await searchWikidata(searchTerm);

      if (searchResults.length > 0) {
        addTrackerCoverage(tracker, {
          id: "wikidata-entity",
          label: "Wikidata knowledge graph",
          source: "wikidata",
          status: "hit",
          detail: `Matched ${searchResults.length} knowledge-graph candidates for ${searchTerm}.`,
        });
      } else {
        addTrackerCoverage(tracker, {
          id: "wikidata-entity",
          label: "Wikidata knowledge graph",
          source: "wikidata",
          status: "miss",
          detail: `No confident knowledge-graph matches were found for ${searchTerm}.`,
        });
      }

      entityMap = await fetchEntities(searchResults.map((entry) => entry.id));
      const linkedIds = uniqueStrings(
        Array.from(entityMap.values()).flatMap((entity) => [
          ...getEntityIds(entity, PROPERTY.instanceOf),
          ...getEntityIds(entity, PROPERTY.headquarters),
          ...getEntityIds(entity, PROPERTY.country),
          ...getEntityIds(entity, PROPERTY.industry),
          ...getEntityIds(entity, PROPERTY.ceo),
          ...getEntityIds(entity, PROPERTY.chairperson),
          ...getEntityIds(entity, PROPERTY.foundedBy),
          ...getEntityIds(entity, PROPERTY.occupation),
          ...getEntityIds(entity, PROPERTY.employer),
          ...getEntityIds(entity, PROPERTY.positionHeld),
          ...getEntityIds(entity, PROPERTY.citizenship),
        ]),
      );
      linkedEntityMap = await fetchEntities(linkedIds);
    } catch (error) {
      addTrackerCoverage(tracker, {
        id: "wikidata-entity",
        label: "Wikidata knowledge graph",
        source: "wikidata",
        status: "miss",
        detail: "Wikidata lookup was unavailable for this search.",
      });
      notes.add(error instanceof Error ? `Wikidata lookup error: ${error.message}` : "Wikidata lookup failed.");
    }

    for (const entry of searchResults) {
      const entity = entityMap.get(entry.id);

      if (!entity) {
        continue;
      }

      const classification = classifyEntity(entity, linkedEntityMap);

      if (!classification) {
        continue;
      }

      if (hint && classification !== hint) {
        continue;
      }

      const aliases = uniqueStrings([
        ...(entity.aliases?.en?.map((alias) => alias.value) ?? []),
        ...(entry.aliases ?? []),
      ]);
      const officialWebsite = getStringValues(entity, PROPERTY.officialWebsite)[0];
      const wikipediaTitle = entity.sitelinks?.enwiki?.title;
      const wikipediaUrl = createWikipediaPageLink(wikipediaTitle);

      if (classification === "company") {
        const headquarters = getEntityIds(entity, PROPERTY.headquarters)
          .map((entityId) => labelForEntityId(entityId, linkedEntityMap))
          .find(Boolean);
        const country = getEntityIds(entity, PROPERTY.country)
          .map((entityId) => labelForEntityId(entityId, linkedEntityMap))
          .find(Boolean);
        const industries = uniqueStrings(
          getEntityIds(entity, PROPERTY.industry).map((entityId) => labelForEntityId(entityId, linkedEntityMap)),
        );
        const leaders = uniquePeople([
          ...getEntityIds(entity, PROPERTY.ceo).map((entityId) => ({
            name: labelForEntityId(entityId, linkedEntityMap) ?? entityId,
            role: "CEO",
            sourcePage: wikipediaUrl,
          })),
          ...getEntityIds(entity, PROPERTY.chairperson).map((entityId) => ({
            name: labelForEntityId(entityId, linkedEntityMap) ?? entityId,
            role: "Chairperson",
            sourcePage: wikipediaUrl,
          })),
          ...getEntityIds(entity, PROPERTY.foundedBy).map((entityId) => ({
            name: labelForEntityId(entityId, linkedEntityMap) ?? entityId,
            role: "Founder",
            sourcePage: wikipediaUrl,
          })),
        ]);
        const foundedYear = getYear(entity, PROPERTY.inception);
        const employeeCount = getQuantity(entity, PROPERTY.employees);
        const githubUsername =
          getStringValues(entity, PROPERTY.github)[0] ??
          extractGitHubOrg(officialWebsite) ??
          extractGitHubOrg(entity.sitelinks?.commonswiki?.title);
        const facts: ExternalProfileFact[] = [];

        if (foundedYear) {
          facts.push({
            label: "Founded",
            value: String(foundedYear),
          });
        }

        if (headquarters) {
          facts.push({
            label: "Headquarters",
            value: headquarters,
          });
        }

        if (country) {
          facts.push({
            label: "Country",
            value: country,
          });
        }

        if (industries[0]) {
          facts.push({
            label: "Industry",
            value: industries[0],
          });
        }

        if (employeeCount !== undefined) {
          facts.push({
            label: "Employees",
            value: formatEmployeeCount(employeeCount) ?? String(employeeCount),
          });
        }

        const links: OrganizationPage[] = [];

        if (officialWebsite) {
          links.push({
            label: "Official site",
            url: officialWebsite,
          });
        }

        if (wikipediaUrl) {
          links.push({
            label: "Wikipedia",
            url: wikipediaUrl,
          });
        }

        links.push({
          label: "Wikidata",
          url: `https://www.wikidata.org/wiki/${entity.id}`,
        });

        const profile: ExternalIntelProfile = {
          id: `wikidata:${entity.id}`,
          kind: "company",
          name: toLabel(entity) ?? entry.label ?? searchTerm,
          description: toDescription(entity) ?? entry.description,
          summary: buildCompanySummary(
            toDescription(entity) ?? entry.description,
            foundedYear,
            headquarters,
            employeeCount,
            leaders.length,
          ),
          website: officialWebsite,
          aliases,
          facts: uniqueFacts(facts),
          people: leaders,
          links: uniquePages(links),
          notes: ["External OSINT matches are best-effort and may be incomplete."],
          source: this.id,
          confidence: "medium",
        };

        profile.confidence = toConfidence(profile, query, targetDomain);
        profiles.push(profile);

        if (githubUsername) {
          githubLogins.set(profile.id, {
            login: githubUsername,
            kind: "company",
          });
        }

        continue;
      }

      const occupations = uniqueStrings(
        getEntityIds(entity, PROPERTY.occupation).map((entityId) => labelForEntityId(entityId, linkedEntityMap)),
      );
      const employers = uniqueStrings(
        getEntityIds(entity, PROPERTY.employer).map((entityId) => labelForEntityId(entityId, linkedEntityMap)),
      );
      const positions = uniqueStrings(
        getEntityIds(entity, PROPERTY.positionHeld).map((entityId) => labelForEntityId(entityId, linkedEntityMap)),
      );
      const citizenship = uniqueStrings(
        getEntityIds(entity, PROPERTY.citizenship).map((entityId) => labelForEntityId(entityId, linkedEntityMap)),
      );
      const githubUsername = getStringValues(entity, PROPERTY.github)[0];
      const facts: ExternalProfileFact[] = [];

      if (occupations[0]) {
        facts.push({
          label: "Occupation",
          value: occupations[0],
        });
      }

      if (employers[0]) {
        facts.push({
          label: "Employer",
          value: employers[0],
        });
      }

      if (positions[0]) {
        facts.push({
          label: "Position",
          value: positions[0],
        });
      }

      if (citizenship[0]) {
        facts.push({
          label: "Public country",
          value: citizenship[0],
        });
      }

      const links: OrganizationPage[] = [];

      if (officialWebsite) {
        links.push({
          label: "Official site",
          url: officialWebsite,
        });
      }

      if (githubUsername) {
        links.push({
          label: "GitHub",
          url: `https://github.com/${githubUsername}`,
        });
      }

      if (wikipediaUrl) {
        links.push({
          label: "Wikipedia",
          url: wikipediaUrl,
        });
      }

      links.push({
        label: "Wikidata",
        url: `https://www.wikidata.org/wiki/${entity.id}`,
      });

      const profile: ExternalIntelProfile = {
        id: `wikidata:${entity.id}`,
        kind: "person",
        name: toLabel(entity) ?? entry.label ?? searchTerm,
        description: toDescription(entity) ?? entry.description,
        summary: buildPersonSummary(toDescription(entity) ?? entry.description, occupations, employers, positions),
        website: officialWebsite,
        aliases,
        facts: uniqueFacts(facts),
        people: [],
        links: uniquePages(links),
        notes: [
          "Person lookups are limited to public knowledge-graph information and may omit non-public or non-notable individuals.",
        ],
        source: this.id,
        confidence: "medium",
      };

      profile.confidence = toConfidence(profile, query, targetDomain);
      profiles.push(profile);

      if (githubUsername) {
        githubLogins.set(profile.id, {
          login: githubUsername,
          kind: "person",
        });
      }
    }

    const filteredProfiles =
      targetDomain && profiles.some((profile) => hostMatchesTarget(profile.website, targetDomain))
        ? profiles.filter((profile) => hostMatchesTarget(profile.website, targetDomain))
        : profiles;
    const limitedProfiles = filteredProfiles
      .sort((left, right) => scoreProfile(right, query, targetDomain) - scoreProfile(left, query, targetDomain))
      .slice(0, 6);

    for (const profile of limitedProfiles) {
      addProfileToTracker(tracker, profile);

      const github = githubLogins.get(profile.id);

      if (!github) {
        continue;
      }

      try {
        if (github.kind === "company") {
          const intel = await fetchGitHubOrgIntel(github.login);
          const enrichment = enrichTrackerWithGitHubOrg(tracker, intel, profile);
          profile.facts = uniqueFacts([...profile.facts, ...enrichment.facts]);
          profile.links = uniquePages([...profile.links, ...enrichment.links]);
          profile.people = uniquePeople([...profile.people, ...enrichment.people]);
          profile.notes = uniqueStrings([...profile.notes, ...enrichment.notes]);
        } else {
          const intel = await fetchGitHubUserIntel(github.login);
          const enrichment = enrichTrackerWithGitHubUser(tracker, intel);
          profile.facts = uniqueFacts([...profile.facts, ...enrichment.facts]);
          profile.links = uniquePages([...profile.links, ...enrichment.links]);
          profile.notes = uniqueStrings([...profile.notes, ...enrichment.notes]);
        }
      } catch (error) {
        addTrackerCoverage(tracker, {
          id: `github:${github.kind}:${github.login.toLowerCase()}`,
          label: github.kind === "company" ? "GitHub public org" : "GitHub public user",
          source: "github",
          status: "miss",
          detail: `GitHub enrichment was unavailable for ${github.login}.`,
        });
        notes.add(
          error instanceof Error ? `GitHub enrichment error for ${github.login}: ${error.message}` : `GitHub enrichment failed for ${github.login}.`,
        );
      }
    }

    if (targetDomain) {
      try {
        addRdapIntelToTracker(tracker, await fetchRdapIntel(targetDomain));
      } catch (error) {
        addTrackerCoverage(tracker, {
          id: "rdap-domain",
          label: "RDAP domain record",
          source: "rdap",
          status: "miss",
          detail: `RDAP metadata was unavailable for ${targetDomain}.`,
        });
        notes.add(error instanceof Error ? `RDAP lookup error: ${error.message}` : "RDAP lookup failed.");
      }
    }

    const mentionTerm =
      targetDomain ??
      explicitCompany ??
      explicitPerson ??
      (query.operator === "text" ? searchTerm : limitedProfiles[0]?.name ?? searchTerm);

    if (mentionTerm.length >= 3) {
      try {
        addHackerNewsToTracker(tracker, mentionTerm, await searchHackerNews(mentionTerm));
      } catch (error) {
        addTrackerCoverage(tracker, {
          id: "hacker-news",
          label: "Hacker News mentions",
          source: "hn-algolia",
          status: "miss",
          detail: `Public discussion lookup was unavailable for ${mentionTerm}.`,
        });
        notes.add(error instanceof Error ? `Hacker News lookup error: ${error.message}` : "Hacker News lookup failed.");
      }
    }

    if (limitedProfiles.length === 0) {
      addTrackerNote(
        tracker,
        targetDomain
          ? "No confident external company profile was matched, but domain registration and public-discussion tracking still ran."
          : "No confident external company or person profile was matched from knowledge-graph sources.",
      );
    }

    if (limitedProfiles.length > 0) {
      addTrackerHighlight(tracker, `${limitedProfiles.length} external public profile matches ranked for review.`);
    }

    tracker.sections = tracker.sections
      .map((section) => ({
        ...section,
        items: section.items
          .sort((left, right) => left.label.localeCompare(right.label) || left.value.localeCompare(right.value))
          .slice(0, 14),
      }))
      .filter((section) => section.items.length > 0)
      .sort((left, right) => left.title.localeCompare(right.title));
    tracker.highlights = tracker.highlights.slice(0, 6);

    for (const note of notes) {
      addTrackerNote(tracker, note);
    }

    const trackerNotes = tracker.notes.length > 0 ? [...tracker.notes] : undefined;

    return {
      source: this.id,
      externalProfiles: limitedProfiles,
      osintTracker: tracker.sections.length > 0 || tracker.coverage.length > 0 ? tracker : undefined,
      relatedAssets: buildRelatedAssets(limitedProfiles, this.id),
      notes:
        limitedProfiles.length === 0 && tracker.coverage.every((entry) => entry.status === "miss")
          ? ["External public OSINT returned no confident profile or passive-source matches."]
          : trackerNotes,
    };
  }
}
