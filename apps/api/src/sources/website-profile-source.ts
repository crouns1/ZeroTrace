import * as cheerio from "cheerio";
import { config } from "../config.js";
import { fetchJson, fetchPage, fetchText } from "../lib/http.js";
import { isDomainLike } from "../lib/query.js";
import type {
  EndpointAsset,
  OrganizationPage,
  OrganizationProfile,
  ParsedQuery,
  PublicPerson,
  SearchSource,
  SourceResult,
  TechFingerprint,
  WebsiteProfile,
} from "../types.js";

const PERSON_ROLE_PATTERN =
  /\b(ceo|cto|coo|cfo|cio|chief|founder|co-founder|manager|director|head|lead|president|vice president|vp|engineer|developer|researcher|designer|architect|officer|owner)\b/i;
const INTERESTING_SEGMENTS = new Set([
  "about",
  "about-us",
  "team",
  "leadership",
  "management",
  "company",
  "people",
  "staff",
  "careers",
  "contact",
  "our-story",
  "who-we-are",
]);
const PERSON_PAGE_PATTERN = /(about|team|leadership|management|company|people|staff|our-story|who-we-are|about-us)/i;
const SOCIAL_HOST_PATTERN =
  /(linkedin\.com|x\.com|twitter\.com|github\.com|facebook\.com|instagram\.com|youtube\.com|tiktok\.com|medium\.com)/i;
const ORGANIZATION_TYPE_PATTERN =
  /(organization|corporation|localbusiness|educationalorganization|ngo|project|brand|webpage|website)/i;
const BLOCKED_NAME_WORDS = new Set([
  "board",
  "blog",
  "careers",
  "company",
  "contact",
  "council",
  "docs",
  "foundation",
  "leadership",
  "security",
  "support",
  "team",
]);
const SECURITY_HEADERS = [
  "content-security-policy",
  "strict-transport-security",
  "x-frame-options",
  "x-content-type-options",
  "referrer-policy",
  "permissions-policy",
];

interface ArchiveResponseRow {
  0?: string;
}

interface PageIntel {
  url: string;
  title?: string;
  siteName?: string;
  description?: string;
  summary?: string;
  generator?: string;
  location?: string;
  foundedYear?: number;
  people: PublicPerson[];
  emails: string[];
  phones: string[];
  socialLinks: string[];
  relevantPages: OrganizationPage[];
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function uniquePeople(values: PublicPerson[]): PublicPerson[] {
  return Array.from(
    new Map(
      values
        .filter((value) => looksLikeName(value.name))
        .map((value) => [`${value.name.toLowerCase()}:${(value.role ?? "").toLowerCase()}`, value]),
    ).values(),
  );
}

function uniquePages(values: OrganizationPage[]): OrganizationPage[] {
  return Array.from(new Map(values.map((value) => [`${value.label}:${value.url}`, value])).values());
}

function uniqueEndpoints(values: EndpointAsset[]): EndpointAsset[] {
  return Array.from(new Map(values.map((value) => [value.url, value])).values());
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function extractYear(value: string): number | undefined {
  const match = value.match(/\b(19\d{2}|20\d{2})\b/);

  if (!match) {
    return undefined;
  }

  const year = Number(match[1]);
  return year >= 1990 && year <= new Date().getUTCFullYear() + 1 ? year : undefined;
}

function looksLikeName(value: string): boolean {
  const trimmed = cleanText(value);

  if (trimmed.length < 5 || trimmed.length > 48 || /[@/|]/.test(trimmed)) {
    return false;
  }

  const words = trimmed.split(/\s+/);

  if (words.length < 2 || words.length > 4) {
    return false;
  }

  if (words.some((word) => BLOCKED_NAME_WORDS.has(word.toLowerCase()))) {
    return false;
  }

  return words.every((word) => /^[A-Z][A-Za-z.'-]+$/.test(word) || /^[A-Z]\.$/.test(word));
}

function parseJsonLd($: cheerio.CheerioAPI): Record<string, unknown>[] {
  const records: Record<string, unknown>[] = [];

  $('script[type="application/ld+json"]').each((_index, element) => {
    const raw = $(element).contents().text().trim();

    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      const items = Array.isArray(parsed) ? parsed : [parsed];

      for (const item of items) {
        if (!item || typeof item !== "object") {
          continue;
        }

        const record = item as Record<string, unknown>;
        records.push(record);

        if (Array.isArray(record["@graph"])) {
          for (const nested of record["@graph"]) {
            if (nested && typeof nested === "object") {
              records.push(nested as Record<string, unknown>);
            }
          }
        }
      }
    } catch {
      // Ignore malformed JSON-LD and continue.
    }
  });

  return records;
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? cleanText(value) : undefined;
}

function normalizeUrl(candidate: string, baseUrl: string, targetHost: string): string | null {
  try {
    const url = new URL(candidate, baseUrl);
    const hostname = url.hostname.toLowerCase();

    if (hostname !== targetHost && !hostname.endsWith(`.${targetHost}`)) {
      return null;
    }

    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function labelForUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.split("/").filter(Boolean).at(-1);

    if (!path) {
      return "Homepage";
    }

    return path.replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  } catch {
    return "Page";
  }
}

function isInterestingPage(url: string, label: string): boolean {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname
      .split("/")
      .filter(Boolean)
      .map((segment) => segment.toLowerCase());

    return segments.some((segment) => INTERESTING_SEGMENTS.has(segment)) || PERSON_PAGE_PATTERN.test(label);
  } catch {
    return PERSON_PAGE_PATTERN.test(url) || PERSON_PAGE_PATTERN.test(label);
  }
}

function extractEmails(text: string): string[] {
  return uniqueStrings(text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []).slice(0, 8);
}

function extractPhones(text: string): string[] {
  return uniqueStrings(
    (text.match(/(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?)?\d{2,4}[\s.-]\d{2,4}[\s.-]\d{3,4}/g) ?? []).filter(
      (value) => /[()\s.-]/.test(value),
    ),
  ).slice(0, 6);
}

function extractPeopleFromStructuredData(records: Record<string, unknown>[], sourcePage: string): PublicPerson[] {
  const people: PublicPerson[] = [];

  for (const record of records) {
    const types = asArray(record["@type"]).map((value) => String(value).toLowerCase());

    if (types.some((value) => value.includes("person"))) {
      const name = stringValue(record.name);
      const role = stringValue(record.jobTitle);

      if (name && looksLikeName(name)) {
        people.push({
          name,
          role,
          sourcePage,
        });
      }
    }

    if (types.some((value) => ORGANIZATION_TYPE_PATTERN.test(value))) {
      for (const key of ["employee", "member", "founder"]) {
        for (const person of asArray(record[key])) {
          if (!person || typeof person !== "object") {
            continue;
          }

          const personRecord = person as Record<string, unknown>;
          const name = stringValue(personRecord.name);
          const role = stringValue(personRecord.jobTitle);

          if (name && looksLikeName(name)) {
            people.push({
              name,
              role: role ?? (key === "founder" ? "Founder" : "Public team listing"),
              sourcePage,
            });
          }
        }
      }
    }
  }

  return uniquePeople(people);
}

function extractPeopleFromMarkup($: cheerio.CheerioAPI, pageUrl: string): PublicPerson[] {
  if (!PERSON_PAGE_PATTERN.test(pageUrl)) {
    return [];
  }

  const people: PublicPerson[] = [];

  $('article, li, section, div').slice(0, 300).each((_index, element) => {
    const container = $(element);
    const name = cleanText(container.find("h1, h2, h3, h4").first().text());

    if (!looksLikeName(name)) {
      return;
    }

    const role = container
      .find('p, span, strong, small, [class*="role"], [class*="title"], [class*="position"]')
      .map((_innerIndex, innerElement) => cleanText($(innerElement).text()))
      .get()
      .find((value) => value !== name && value.length <= 120 && PERSON_ROLE_PATTERN.test(value));

    if (!role) {
      return;
    }

    people.push({
      name,
      role,
      sourcePage: pageUrl,
    });
  });

  return uniquePeople(people).slice(0, 20);
}

function detectTechStack(html: string, headers: Record<string, string>, generator?: string): TechFingerprint[] {
  const lowerHtml = html.toLowerCase();
  const technologies: TechFingerprint[] = [];

  if (generator) {
    const lowerGenerator = generator.toLowerCase();

    if (lowerGenerator.includes("wordpress")) {
      technologies.push({
        name: "WordPress",
        category: "cms",
        source: "meta-generator",
        confidence: "high",
        historicalCves: ["CVE-2024-28000"],
        evidence: generator,
      });
    } else if (lowerGenerator.includes("drupal")) {
      technologies.push({
        name: "Drupal",
        category: "cms",
        source: "meta-generator",
        confidence: "high",
        historicalCves: ["CVE-2024-45440"],
        evidence: generator,
      });
    } else {
      technologies.push({
        name: generator,
        category: "framework",
        source: "meta-generator",
        confidence: "medium",
        historicalCves: [],
      });
    }
  }

  const server = headers.server;
  const poweredBy = headers["x-powered-by"];

  if (server) {
    technologies.push({
      name: server,
      category: "server",
      source: "http-header",
      confidence: "high",
      historicalCves: server.toLowerCase().includes("apache")
        ? ["CVE-2024-38475"]
        : server.toLowerCase().includes("nginx")
          ? ["CVE-2023-44487"]
          : [],
      evidence: `server: ${server}`,
    });
  }

  if (poweredBy) {
    technologies.push({
      name: poweredBy,
      category: "platform",
      source: "http-header",
      confidence: "high",
      historicalCves:
        poweredBy.toLowerCase().includes("express") || poweredBy.toLowerCase().includes("node")
          ? ["CVE-2024-29041"]
          : [],
      evidence: `x-powered-by: ${poweredBy}`,
    });
  }

  const markers: Array<[string, TechFingerprint]> = [
    [
      "__next_data__",
      {
        name: "Next.js",
        category: "framework",
        source: "html-marker",
        confidence: "medium",
        historicalCves: ["CVE-2025-29927"],
        evidence: "__NEXT_DATA__",
      },
    ],
    [
      "wp-content",
      {
        name: "WordPress",
        category: "cms",
        source: "html-marker",
        confidence: "medium",
        historicalCves: ["CVE-2024-28000"],
        evidence: "wp-content",
      },
    ],
    [
      "drupal-settings-json",
      {
        name: "Drupal",
        category: "cms",
        source: "html-marker",
        confidence: "medium",
        historicalCves: ["CVE-2024-45440"],
        evidence: "drupal-settings-json",
      },
    ],
    [
      "cdn.shopify.com",
      {
        name: "Shopify",
        category: "platform",
        source: "html-marker",
        confidence: "medium",
        historicalCves: [],
        evidence: "cdn.shopify.com",
      },
    ],
    [
      "cloudflare",
      {
        name: "Cloudflare",
        category: "cdn",
        source: "html-marker",
        confidence: "low",
        historicalCves: [],
        evidence: "cloudflare",
      },
    ],
  ];

  for (const [marker, technology] of markers) {
    if (lowerHtml.includes(marker)) {
      technologies.push(technology);
    }
  }

  return Array.from(new Map(technologies.map((technology) => [technology.name, technology])).values());
}

function buildSecurityHeaders(headers: Record<string, string>) {
  return SECURITY_HEADERS.map((header) => ({
    name: header,
    present: Boolean(headers[header]),
    value: headers[header],
  }));
}

function extractStructuredOrganization(
  records: Record<string, unknown>[],
): Pick<OrganizationProfile, "name" | "description" | "foundedYear" | "location" | "socialLinks"> {
  let name: string | undefined;
  let description: string | undefined;
  let foundedYear: number | undefined;
  let location: string | undefined;
  let socialLinks: string[] = [];

  for (const record of records) {
    const types = asArray(record["@type"]).map((value) => String(value).toLowerCase());

    if (!types.some((value) => ORGANIZATION_TYPE_PATTERN.test(value))) {
      continue;
    }

    name ??= stringValue(record.name);
    description ??= stringValue(record.description);
    foundedYear ??= extractYear(stringValue(record.foundingDate) ?? "");
    socialLinks = socialLinks.concat(
      asArray(record.sameAs).flatMap((value) => (typeof value === "string" ? [value] : [])),
    );

    if (!location) {
      const address = record.address as Record<string, unknown> | undefined;

      if (address && typeof address === "object") {
        const parts = [
          stringValue(address.addressLocality),
          stringValue(address.addressRegion),
          stringValue(address.addressCountry),
        ].filter(Boolean);

        if (parts.length > 0) {
          location = parts.join(", ");
        }
      }
    }
  }

  return {
    name,
    description,
    foundedYear,
    location,
    socialLinks: uniqueStrings(socialLinks.filter((value) => SOCIAL_HOST_PATTERN.test(value))),
  };
}

export class WebsiteProfileSource implements SearchSource {
  readonly id = "website-profile";

  supports(query: ParsedQuery): boolean {
    return query.operator !== "ip" && isDomainLike(query.value);
  }

  async search(query: ParsedQuery): Promise<SourceResult> {
    const target = query.value.toLowerCase();
    const homepage = await this.fetchPageIntel(`https://${target}`);
    const fallbackHomepage = homepage ?? (await this.fetchPageIntel(`http://${target}`));

    if (!fallbackHomepage) {
      return {
        source: this.id,
        notes: [`Could not build a website profile for ${target}.`],
      };
    }

    const targetHost = new URL(fallbackHomepage.baseUrl).hostname.toLowerCase();
    const relevantPageUrls = fallbackHomepage.relevantPages
      .map((page) => page.url)
      .filter((value) => value !== fallbackHomepage.baseUrl)
      .slice(0, config.maxOrganizationPages);
    const relatedPages = await Promise.allSettled(relevantPageUrls.map((url) => this.fetchPageIntel(url)));
    const pages = [
      fallbackHomepage,
      ...relatedPages.flatMap((result) => (result.status === "fulfilled" && result.value ? [result.value] : [])),
    ];
    const earliestArchiveYear = await this.lookupEarliestArchiveYear(target).catch(() => undefined);
    const organizationName =
      pages.map((page) => page.organization.name).find((value) => value && !/\b(docs|support|blog)\b/i.test(value)) ??
      pages.map((page) => page.organization.name).find(Boolean);
    const description = pages.map((page) => page.organization.description ?? page.summary).find(Boolean);
    const people = uniquePeople(pages.flatMap((page) => page.organization.people)).slice(0, 24);
    const relevantPages = uniquePages([
      { label: "Homepage", url: fallbackHomepage.baseUrl },
      ...pages.flatMap((page) => page.relevantPages),
    ]).slice(0, 10);
    const websiteProfile: WebsiteProfile = {
      baseUrl: fallbackHomepage.baseUrl,
      finalUrl: fallbackHomepage.baseUrl,
      statusCode: fallbackHomepage.statusCode,
      server: fallbackHomepage.server,
      poweredBy: fallbackHomepage.poweredBy,
      titles: uniqueStrings(pages.flatMap((page) => (page.title ? [page.title] : []))).slice(0, 5),
      techStack: Array.from(
        new Map(
          pages.flatMap((page) => page.techStack).map((technology) => [`${technology.name}:${technology.source}`, technology]),
        ).values(),
      ),
      endpoints: uniqueEndpoints([
        ...fallbackHomepage.endpoints,
        ...pages.flatMap((page) => page.endpoints),
      ]).slice(0, 20),
      securityHeaders: fallbackHomepage.securityHeaders,
      sources: [this.id],
    };
    const organization: OrganizationProfile = {
      website: fallbackHomepage.baseUrl,
      name: organizationName,
      summary: this.buildSummary(description, fallbackHomepage.organization.foundedYear, earliestArchiveYear, people.length),
      description,
      foundedYear:
        pages.map((page) => page.organization.foundedYear).find((value): value is number => typeof value === "number"),
      earliestArchiveYear,
      location: pages.map((page) => page.organization.location).find(Boolean),
      generator: pages.map((page) => page.organization.generator).find(Boolean),
      emails: uniqueStrings(pages.flatMap((page) => page.organization.emails)),
      phones: uniqueStrings(pages.flatMap((page) => page.organization.phones)),
      socialLinks: uniqueStrings(pages.flatMap((page) => page.organization.socialLinks)).slice(0, 8),
      relevantPages,
      people,
      sources: [this.id],
    };
    const relatedAssets = [
      ...people.slice(0, 8).map((person) => ({
        kind: "person" as const,
        value: person.name,
        relation: person.role ? `public team listing: ${person.role}` : "public team listing",
        source: this.id,
      })),
      ...websiteProfile.endpoints.slice(0, 8).map((endpoint) => ({
        kind: "endpoint" as const,
        value: endpoint.path,
        relation: `endpoint discovered from ${endpoint.kind}`,
        source: this.id,
      })),
      ...websiteProfile.techStack.slice(0, 6).map((technology) => ({
        kind: "tech" as const,
        value: technology.name,
        relation: `tech fingerprint: ${technology.category}`,
        source: this.id,
      })),
    ];
    const notes: string[] = [];

    if (!organization.foundedYear) {
      notes.push(
        "Founding year could not be confirmed from the target site. Earliest archive year is a best-effort proxy, not a guaranteed build year.",
      );
    }

    if (organization.people.length === 0) {
      notes.push(
        "No public leadership or team profiles were detected on the target website. ReconPulse does not scrape third-party employee directories.",
      );
    }

    return {
      source: this.id,
      organization,
      websiteProfile,
      relatedAssets,
      notes,
    };
  }

  private async fetchPageIntel(url: string): Promise<
    | (PageIntel & {
        baseUrl: string;
        endpoints: EndpointAsset[];
        securityHeaders: WebsiteProfile["securityHeaders"];
        server?: string;
        poweredBy?: string;
        statusCode?: number;
        techStack: TechFingerprint[];
        organization: OrganizationProfile;
      })
    | null
  > {
    try {
      const response = await fetchPage(url);
      const $ = cheerio.load(response.text);
      const targetHost = new URL(response.finalUrl).hostname.toLowerCase();
      const pageText = cleanText($("body").text());
      const title = cleanText($("title").first().text());
      const description =
        $('meta[name="description"]').attr("content") ??
        $('meta[property="og:description"]').attr("content");
      const summary = $("main p, article p, p")
        .map((_index, element) => cleanText($(element).text()))
        .get()
        .find((value) => value.length > 80 && value.length < 260);
      const generator = $('meta[name="generator"]').attr("content") ?? undefined;
      const jsonLd = parseJsonLd($);
      const structuredOrganization = extractStructuredOrganization(jsonLd);
      const people = uniquePeople([
        ...extractPeopleFromStructuredData(jsonLd, response.finalUrl),
        ...extractPeopleFromMarkup($, response.finalUrl),
      ]);
      const relevantPages = uniquePages(
        $("a[href]")
          .map((_index, element) => {
            const href = $(element).attr("href") ?? "";
            const normalized = normalizeUrl(href, response.finalUrl, targetHost);
            const label = cleanText($(element).text()) || (normalized ? labelForUrl(normalized) : "");

            if (!normalized || !isInterestingPage(normalized, label)) {
              return null;
            }

            return {
              label: label.length <= 32 ? label : labelForUrl(normalized),
              url: normalized,
            };
          })
          .get()
          .filter((value): value is OrganizationPage => Boolean(value)),
      );
      const endpoints = await this.discoverEndpoints(response.finalUrl, targetHost, $, pageText);
      const techStack = detectTechStack(response.text, response.headers, generator);
      const organization: OrganizationProfile = {
        website: response.finalUrl,
        name: structuredOrganization.name ?? inferTitleName(title),
        summary,
        description: structuredOrganization.description ?? description,
        foundedYear:
          structuredOrganization.foundedYear ??
          extractYear(pageText.match(/\b(founded|established|since)[^.]{0,40}/i)?.[0] ?? ""),
        earliestArchiveYear: undefined,
        location:
          structuredOrganization.location ??
          $("address")
            .map((_index, element) => cleanText($(element).text()))
            .get()
            .find(Boolean),
        generator,
        emails: uniqueStrings([
          ...extractEmails(pageText),
          ...$('a[href^="mailto:"]')
            .map((_index, element) => ($(element).attr("href") ?? "").replace(/^mailto:/, ""))
            .get(),
        ]),
        phones: uniqueStrings([
          ...extractPhones(pageText),
          ...$('a[href^="tel:"]')
            .map((_index, element) => ($(element).attr("href") ?? "").replace(/^tel:/, ""))
            .get(),
        ]),
        socialLinks: uniqueStrings(
          $("a[href]")
            .map((_index, element) => $(element).attr("href") ?? "")
            .get()
            .filter((href) => SOCIAL_HOST_PATTERN.test(href)),
        ),
        relevantPages,
        people,
        sources: [this.id],
      };

      return {
        url: response.finalUrl,
        baseUrl: response.finalUrl,
        title: title || undefined,
        siteName: structuredOrganization.name,
        description: description ? cleanText(description) : undefined,
        summary,
        generator,
        location: organization.location,
        foundedYear: organization.foundedYear,
        people,
        emails: organization.emails,
        phones: organization.phones,
        socialLinks: organization.socialLinks,
        relevantPages,
        endpoints,
        securityHeaders: buildSecurityHeaders(response.headers),
        server: response.headers.server,
        poweredBy: response.headers["x-powered-by"],
        statusCode: response.status,
        techStack,
        organization,
      };
    } catch {
      return null;
    }
  }

  private async discoverEndpoints(
    baseUrl: string,
    targetHost: string,
    $: cheerio.CheerioAPI,
    pageText: string,
  ): Promise<EndpointAsset[]> {
    const endpoints: EndpointAsset[] = [];

    const candidateLinks = $("a[href]")
      .map((_index, element) => {
        const href = $(element).attr("href") ?? "";
        const normalized = normalizeUrl(href, baseUrl, targetHost);

        if (!normalized) {
          return null;
        }

        const url = new URL(normalized);
        const path = url.pathname;

        if (path === "/" || path.length < 2) {
          return null;
        }

        return {
          path,
          url: normalized,
          source: this.id,
          kind: "public" as const,
        };
      })
      .get()
      .filter(Boolean)
      .map((value) => value as EndpointAsset)
      .slice(0, 12);

    endpoints.push(...candidateLinks);

    for (const path of ["/robots.txt", "/sitemap.xml"]) {
      try {
        const url = new URL(path, baseUrl).toString();
        const body = await fetchText(url);

        endpoints.push({
          path,
          url,
          source: this.id,
          kind: path.includes("robots") ? "robots" : "sitemap",
        });

        if (path === "/robots.txt") {
          const robotPaths = body
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => /^disallow:/i.test(line))
            .map((line) => line.split(":").slice(1).join(":").trim())
            .filter((line) => line.startsWith("/") && line.length > 1)
            .slice(0, 8);

          for (const robotPath of robotPaths) {
            endpoints.push({
              path: robotPath,
              url: new URL(robotPath, baseUrl).toString(),
              source: this.id,
              kind: "robots",
            });
          }
        }

        if (path === "/sitemap.xml") {
          const sitemapMatches = Array.from(body.matchAll(/<loc>([^<]+)<\/loc>/gi))
            .map((match) => match[1])
            .filter(Boolean)
            .slice(0, 10);

          for (const match of sitemapMatches) {
            try {
              const parsed = new URL(match);
              endpoints.push({
                path: parsed.pathname,
                url: parsed.toString(),
                source: this.id,
                kind: "sitemap",
              });
            } catch {
              // Ignore malformed sitemap URLs.
            }
          }
        }
      } catch {
        // Robots and sitemap are optional enrichment only.
      }
    }

    if (pageText.toLowerCase().includes("graphql")) {
      endpoints.push({
        path: "/graphql",
        url: new URL("/graphql", baseUrl).toString(),
        source: this.id,
        kind: "common",
      });
    }

    return uniqueEndpoints(endpoints).slice(0, 20);
  }

  private buildSummary(
    description: string | undefined,
    foundedYear: number | undefined,
    earliestArchiveYear: number | undefined,
    peopleCount: number,
  ): string | undefined {
    const parts = [description];

    if (foundedYear) {
      parts.push(`Public founding signal detected: ${foundedYear}.`);
    } else if (earliestArchiveYear) {
      parts.push(`Earliest archive signal detected: ${earliestArchiveYear}.`);
    }

    if (peopleCount > 0) {
      parts.push(`Detected ${peopleCount} public team or leadership profiles on the target site.`);
    }

    return parts.filter(Boolean).join(" ") || undefined;
  }

  private async lookupEarliestArchiveYear(hostname: string): Promise<number | undefined> {
    try {
      const url =
        `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(hostname)}` +
        "&output=json&fl=timestamp&filter=statuscode:200&limit=1&from=1996";
      const payload = await fetchJson<ArchiveResponseRow[][]>(url, {
        signal: AbortSignal.timeout(config.archiveLookupTimeoutMs),
      });
      const row = payload.at(1)?.at(0);

      if (!row) {
        return undefined;
      }

      const year = Number(String(row).slice(0, 4));
      return Number.isFinite(year) ? year : undefined;
    } catch {
      return undefined;
    }
  }
}

function inferTitleName(title: string): string | undefined {
  const cleaned = cleanText(title);

  if (!cleaned) {
    return undefined;
  }

  const candidates = cleaned.split(/[|\-–:]/).map((value) => cleanText(value));
  return candidates.find((value) => value && !/\b(home|docs|support|blog)\b/i.test(value)) ?? candidates[0];
}
