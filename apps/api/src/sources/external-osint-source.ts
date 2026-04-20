import { fetchJson } from "../lib/http.js";
import { isDomainLike } from "../lib/query.js";
import type {
  ExternalIntelProfile,
  ExternalProfileFact,
  OrganizationPage,
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

interface GitHubPublicMember {
  login: string;
  html_url: string;
  type?: string;
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

function getSearchTerm(query: ParsedQuery): string {
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

async function searchWikidata(term: string): Promise<WikidataSearchEntry[]> {
  const params = new URLSearchParams({
    action: "wbsearchentities",
    format: "json",
    language: "en",
    type: "item",
    limit: "5",
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

async function fetchGitHubOrg(login: string): Promise<{
  facts: ExternalProfileFact[];
  links: OrganizationPage[];
  people: PublicPerson[];
  notes: string[];
} | null> {
  const org = await fetchJson<GitHubOrgResponse>(`https://api.github.com/orgs/${encodeURIComponent(login)}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  const members = await fetchJson<GitHubPublicMember[]>(
    `https://api.github.com/orgs/${encodeURIComponent(login)}/public_members?per_page=10`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );

  const facts: ExternalProfileFact[] = [
    {
      label: "GitHub org",
      value: org.login,
      href: org.html_url,
    },
  ];

  if (org.public_repos !== undefined) {
    facts.push({
      label: "Public repos",
      value: org.public_repos.toLocaleString("en-US"),
    });
  }

  if (org.followers !== undefined) {
    facts.push({
      label: "Followers",
      value: org.followers.toLocaleString("en-US"),
    });
  }

  const links: OrganizationPage[] = [
    {
      label: "GitHub org",
      url: org.html_url,
    },
  ];

  if (org.blog) {
    links.push({
      label: "GitHub blog",
      url: org.blog,
    });
  }

  if (org.location) {
    facts.push({
      label: "GitHub location",
      value: org.location,
    });
  }

  return {
    facts,
    links,
    people: uniquePeople(
      members
        .filter((member) => member.type === "User" || member.type === undefined)
        .map((member) => ({
          name: member.login,
          role: "Public GitHub member",
          sourcePage: member.html_url,
        })),
    ),
    notes:
      members.length > 0
        ? ["GitHub public members are public org profiles and may not represent a complete employee list."]
        : [],
  };
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

export class ExternalOsintSource implements SearchSource {
  readonly id = "external-osint";

  supports(query: ParsedQuery): boolean {
    return query.operator !== "ip";
  }

  async search(query: ParsedQuery): Promise<SourceResult> {
    const searchTerm = getSearchTerm(query);

    if (!searchTerm) {
      return {
        source: this.id,
        externalProfiles: [],
        notes: ["External OSINT search needs a company name, person name, or domain-oriented query."],
      };
    }

    const searchResults = await searchWikidata(searchTerm);
    const entityMap = await fetchEntities(searchResults.map((entry) => entry.id));
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
    const linkedEntityMap = await fetchEntities(linkedIds);
    const targetDomain =
      query.operator === "domain"
        ? query.value.toLowerCase()
        : query.operator === "subdomain"
          ? query.value.toLowerCase()
          : undefined;
    const hint = inferSearchHint(query);
    const profiles: ExternalIntelProfile[] = [];

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

        const notes = ["External OSINT matches are best-effort and may be incomplete."];
        let publicPeople = leaders;

        if (githubUsername) {
          try {
            const gitHub = await fetchGitHubOrg(githubUsername);

            if (gitHub) {
              facts.push(...gitHub.facts);
              links.push(...gitHub.links);
              publicPeople = uniquePeople([...publicPeople, ...gitHub.people]);
              notes.push(...gitHub.notes);
            }
          } catch {
            notes.push(`GitHub enrichment was not available for ${githubUsername}.`);
          }
        }

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
            publicPeople.length,
          ),
          website: officialWebsite,
          aliases,
          facts: uniqueFacts(facts),
          people: publicPeople,
          links: uniquePages(links),
          notes: uniqueStrings(notes),
          source: this.id,
          confidence: "medium",
        };

        profile.confidence = toConfidence(profile, query, targetDomain);

        if (targetDomain && !hostMatchesTarget(profile.website, targetDomain) && profiles.length > 0) {
          continue;
        }

        profiles.push(profile);
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
        notes: ["Person lookups are limited to public knowledge-graph information and may omit non-public or non-notable individuals."],
        source: this.id,
        confidence: "medium",
      };

      profile.confidence = toConfidence(profile, query);
      profiles.push(profile);
    }

    const filteredProfiles =
      targetDomain && profiles.some((profile) => hostMatchesTarget(profile.website, targetDomain))
        ? profiles.filter((profile) => hostMatchesTarget(profile.website, targetDomain))
        : profiles;
    const limitedProfiles = filteredProfiles
      .sort((left, right) => scoreProfile(right, query, targetDomain) - scoreProfile(left, query, targetDomain))
      .slice(0, 4);

    return {
      source: this.id,
      externalProfiles: limitedProfiles,
      relatedAssets: buildRelatedAssets(limitedProfiles, this.id),
      notes:
        limitedProfiles.length === 0
          ? ["External public OSINT returned no confident company or person matches."]
          : undefined,
    };
  }
}
