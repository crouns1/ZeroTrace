import * as cheerio from "cheerio";
import { config } from "../config.js";
import { fetchText } from "../lib/http.js";
import { isDomainLike } from "../lib/query.js";
import type {
  OrganizationPage,
  OrganizationProfile,
  ParsedQuery,
  PublicPerson,
  SearchSource,
  SourceResult,
} from "../types.js";

const PERSON_ROLE_PATTERN =
  /\b(ceo|cto|coo|cfo|cio|chief|founder|co-founder|manager|director|head|lead|president|vice president|vp|engineer|developer|researcher|designer|architect|officer|owner)\b/i;
const INTERESTING_PATH_PATTERN =
  /(about|team|leadership|management|company|people|staff|careers|contact|our-story|who-we-are|about-us)/i;
const PERSON_PAGE_PATTERN = /(about|team|leadership|management|company|people|staff|our-story|who-we-are|about-us)/i;
const SOCIAL_HOST_PATTERN =
  /(linkedin\.com|x\.com|twitter\.com|github\.com|facebook\.com|instagram\.com|youtube\.com|tiktok\.com|medium\.com)/i;
const ORGANIZATION_TYPE_PATTERN =
  /(organization|corporation|localbusiness|educationalorganization|ngo|project|brand|webpage|website)/i;
const INTERESTING_LABEL_PATTERN =
  /^(about|about us|team|leadership|management|company|people|staff|careers|contact|our story|who we are)\b/i;
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

interface ArchiveResponseRow {
  0?: string;
}

interface PageIntel {
  url: string;
  label: string;
  pageTitle?: string;
  siteName?: string;
  description?: string;
  summaryParagraph?: string;
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
  return Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
}

function uniquePages(values: OrganizationPage[]): OrganizationPage[] {
  const seen = new Set<string>();
  const next: OrganizationPage[] = [];

  for (const value of values) {
    const key = `${value.label}:${value.url}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    next.push(value);
  }

  return next;
}

function uniquePeople(values: PublicPerson[]): PublicPerson[] {
  const seen = new Set<string>();
  const next: PublicPerson[] = [];

  for (const value of values) {
    const key = `${value.name.toLowerCase()}:${(value.role ?? "").toLowerCase()}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    next.push(value);
  }

  return next;
}

function hostnameLabel(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/+$/, "");

    if (!path || path === "") {
      return "Homepage";
    }

    return path
      .split("/")
      .filter(Boolean)
      .slice(-1)[0]
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  } catch {
    return "Page";
  }
}

function normalizeUrl(candidate: string, base: string, targetHost: string): string | null {
  try {
    const resolved = new URL(candidate, base);
    const hostname = resolved.hostname.toLowerCase();

    if (
      hostname !== targetHost &&
      !hostname.endsWith(`.${targetHost}`) &&
      targetHost !== hostname.replace(/^www\./, "")
    ) {
      return null;
    }

    resolved.hash = "";
    return resolved.toString();
  } catch {
    return null;
  }
}

function isInterestingPage(url: string, label: string): boolean {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname
      .split("/")
      .filter(Boolean)
      .map((segment) => segment.toLowerCase());

    return (
      segments.some((segment) => INTERESTING_SEGMENTS.has(segment)) ||
      (label.length <= 40 && INTERESTING_LABEL_PATTERN.test(label))
    );
  } catch {
    return INTERESTING_PATH_PATTERN.test(url) || INTERESTING_LABEL_PATTERN.test(label);
  }
}

function getYearFromText(value: string): number | undefined {
  const yearMatch = value.match(/\b(19\d{2}|20\d{2})\b/);

  if (!yearMatch) {
    return undefined;
  }

  const year = Number(yearMatch[1]);
  return year >= 1990 && year <= new Date().getUTCFullYear() + 1 ? year : undefined;
}

function looksLikeName(value: string): boolean {
  const trimmed = value.trim();
  const blockedWords = [
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
  ];

  if (trimmed.length < 5 || trimmed.length > 48) {
    return false;
  }

  if (/[|@/]/.test(trimmed)) {
    return false;
  }

  const words = trimmed.split(/\s+/);

  if (words.length < 2 || words.length > 4) {
    return false;
  }

  if (words.some((word) => blockedWords.includes(word.toLowerCase()))) {
    return false;
  }

  return words.every((word) => /^[A-Z][A-Za-z.'-]+$/.test(word) || /^[A-Z]\.$/.test(word));
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function extractTextContent($: cheerio.CheerioAPI, selector: string): string[] {
  return $(selector)
    .map((_index, element) => cleanText($(element).text()))
    .get()
    .filter(Boolean);
}

function parseJsonLd($: cheerio.CheerioAPI): Record<string, unknown>[] {
  const nodes: Record<string, unknown>[] = [];

  $('script[type="application/ld+json"]').each((_index, element) => {
    const raw = $(element).contents().text().trim();

    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      const queue = Array.isArray(parsed) ? parsed : [parsed];

      while (queue.length > 0) {
        const item = queue.shift();

        if (!item || typeof item !== "object") {
          continue;
        }

        const record = item as Record<string, unknown>;
        nodes.push(record);

        if (Array.isArray(record["@graph"])) {
          queue.push(...record["@graph"]);
        }
      }
    } catch {
      // Ignore malformed structured data and continue with best-effort parsing.
    }
  });

  return nodes;
}

function arrayify<T>(value: T | T[] | undefined): T[] {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function valueAsString(value: unknown): string | undefined {
  return typeof value === "string" ? cleanText(value) : undefined;
}

function extractStructuredPeople(records: Record<string, unknown>[], pageUrl: string): PublicPerson[] {
  const people: PublicPerson[] = [];

  for (const record of records) {
    const types = arrayify(record["@type"]).map((value) => String(value).toLowerCase());

    if (!types.some((value) => value.includes("person"))) {
      continue;
    }

    const name = valueAsString(record.name);
    const role = valueAsString(record.jobTitle);

    if (!name || !looksLikeName(name)) {
      continue;
    }

    people.push({
      name,
      role,
      sourcePage: pageUrl,
    });
  }

  return people;
}

function extractOrganizationSignals(
  records: Record<string, unknown>[],
  pageUrl: string,
): Partial<OrganizationProfile> & { people: PublicPerson[] } {
  let name: string | undefined;
  let description: string | undefined;
  let foundedYear: number | undefined;
  let location: string | undefined;
  let sameAs: string[] = [];
  let people: PublicPerson[] = [];

  for (const record of records) {
    const types = arrayify(record["@type"]).map((value) => String(value).toLowerCase());

    if (!types.some((value) => ORGANIZATION_TYPE_PATTERN.test(value))) {
      continue;
    }

    name ??= valueAsString(record.name);
    description ??= valueAsString(record.description);

    const foundingDate = valueAsString(record.foundingDate);
    foundedYear ??= foundingDate ? getYearFromText(foundingDate) : undefined;

    if (!location) {
      const address = record.address as Record<string, unknown> | undefined;

      if (address && typeof address === "object") {
        const parts = [
          valueAsString(address.addressLocality),
          valueAsString(address.addressRegion),
          valueAsString(address.addressCountry),
        ].filter(Boolean);

        if (parts.length > 0) {
          location = parts.join(", ");
        }
      }
    }

    sameAs = sameAs.concat(arrayify(record.sameAs).flatMap((value) => (typeof value === "string" ? [value] : [])));

    for (const personField of ["employee", "member", "founder"]) {
      for (const item of arrayify(record[personField])) {
        if (!item || typeof item !== "object") {
          continue;
        }

        const personRecord = item as Record<string, unknown>;
        const personName = valueAsString(personRecord.name);
        const role =
          valueAsString(personRecord.jobTitle) ??
          (personField === "founder" ? "Founder" : personField === "employee" ? "Employee" : "Member");

        if (!personName || !looksLikeName(personName)) {
          continue;
        }

        people.push({
          name: personName,
          role,
          sourcePage: pageUrl,
        });
      }
    }
  }

  return {
    name,
    description,
    foundedYear,
    location,
    socialLinks: uniqueStrings(sameAs.filter((value) => SOCIAL_HOST_PATTERN.test(value))),
    people: uniquePeople(people),
  };
}

function extractHeuristicPeople($: cheerio.CheerioAPI, pageUrl: string): PublicPerson[] {
  if (!PERSON_PAGE_PATTERN.test(pageUrl)) {
    return [];
  }

  const candidates: PublicPerson[] = [];
  const containers = $('article, li, section, div').slice(0, 300);

  containers.each((_index, element) => {
    const container = $(element);
    const name =
      cleanText(container.find('h1, h2, h3, h4, [class*="name"]').first().text()) ||
      cleanText(container.children('h1, h2, h3, h4').first().text());

    if (!name || !looksLikeName(name)) {
      return;
    }

    const roleCandidates = container
      .find('[class*="role"], [class*="title"], [class*="position"], p, span, small, strong')
      .map((_innerIndex, innerElement) => cleanText($(innerElement).text()))
      .get()
      .filter((value) => value && value !== name && value.length <= 80 && PERSON_ROLE_PATTERN.test(value));

    const role = roleCandidates[0];

    if (!role) {
      return;
    }

    candidates.push({
      name,
      role,
      sourcePage: pageUrl,
    });
  });

  return uniquePeople(candidates).slice(0, 20);
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

function inferFoundedYearFromText(values: string[]): number | undefined {
  for (const value of values) {
    const foundedMatch = value.match(
      /\b(founded|established|launched|since|started)\b[^.]{0,32}\b(19\d{2}|20\d{2})\b/i,
    );

    if (foundedMatch?.[2]) {
      return Number(foundedMatch[2]);
    }
  }

  return undefined;
}

export class WebsiteProfileSource implements SearchSource {
  readonly id = "website-profile";

  supports(query: ParsedQuery): boolean {
    return query.operator !== "ip" && isDomainLike(query.value);
  }

  async search(query: ParsedQuery): Promise<SourceResult> {
    const target = query.value.toLowerCase();
    const homepage = await this.fetchPage(`https://${target}`, target);
    const fallbackHomepage = homepage ?? (await this.fetchPage(`http://${target}`, target));

    if (!fallbackHomepage) {
      return {
        source: this.id,
        notes: [`Could not fetch the target website profile for ${target}.`],
      };
    }

    const targetHost = new URL(fallbackHomepage.url).hostname.toLowerCase();
    const candidateUrls = uniqueStrings([
      ...fallbackHomepage.relevantPages.map((page) => page.url),
      ...[
        "/about",
        "/about-us",
        "/team",
        "/leadership",
        "/management",
        "/company",
        "/people",
        "/staff",
        "/careers",
        "/contact",
      ]
        .map((path) => normalizeUrl(path, fallbackHomepage.url, targetHost))
        .filter((value): value is string => Boolean(value)),
    ])
      .filter((url) => url !== fallbackHomepage.url)
      .slice(0, config.maxOrganizationPages);

    const pageResults = await Promise.allSettled(
      candidateUrls.map((url) => this.fetchPage(url, targetHost)),
    );
    const pages = [
      fallbackHomepage,
      ...pageResults.flatMap((item) => (item.status === "fulfilled" && item.value ? [item.value] : [])),
    ];

    const earliestArchiveYear = await this.lookupEarliestArchiveYear(target).catch(() => undefined);
    const allDescriptions = uniqueStrings(
      pages.flatMap((page) => [page.description ?? "", page.summaryParagraph ?? ""]),
    );
    const foundedYear =
      pages.map((page) => page.foundedYear).find((value): value is number => typeof value === "number") ??
      inferFoundedYearFromText(allDescriptions);
    const people = uniquePeople(pages.flatMap((page) => page.people)).slice(0, 24);
    const relevantPages = uniquePages([
      { label: "Homepage", url: fallbackHomepage.url },
      ...pages.flatMap((page) => page.relevantPages),
    ]).slice(0, 10);
    const organization: OrganizationProfile = {
      website: fallbackHomepage.url,
      name: this.pickOrganizationName(pages),
      summary: this.buildSummary(
        pages.map((page) => page.description ?? page.summaryParagraph).find(Boolean),
        foundedYear,
        earliestArchiveYear,
        people.length,
      ),
      description: pages.map((page) => page.description ?? page.summaryParagraph).find(Boolean),
      foundedYear,
      earliestArchiveYear,
      location: pages.map((page) => page.location).find(Boolean),
      generator: pages.map((page) => page.generator).find(Boolean),
      emails: uniqueStrings(pages.flatMap((page) => page.emails)),
      phones: uniqueStrings(pages.flatMap((page) => page.phones)),
      socialLinks: uniqueStrings(pages.flatMap((page) => page.socialLinks)).slice(0, 8),
      relevantPages,
      people,
      sources: [this.id],
    };

    const relatedAssets = people.slice(0, 8).map((person) => ({
      kind: "person" as const,
      value: person.name,
      relation: person.role ? `public team listing: ${person.role}` : "public team listing",
      source: this.id,
    }));
    const notes: string[] = [];

    if (!organization.foundedYear) {
      notes.push(
        "Founding year could not be confirmed from the target site. Earliest archive year is a best-effort proxy, not a guarantee of the actual build year.",
      );
    }

    if (organization.people.length === 0) {
      notes.push(
        "No public leadership or team profiles were detected on the target website. Zero Trace does not scrape third-party employee networks.",
      );
    }

    return {
      source: this.id,
      organization,
      relatedAssets,
      notes,
    };
  }

  private buildSummary(
    description: string | undefined,
    foundedYear: number | undefined,
    earliestArchiveYear: number | undefined,
    peopleCount: number,
  ): string | undefined {
    const parts: string[] = [];

    if (description) {
      parts.push(description);
    }

    if (foundedYear) {
      parts.push(`Public founding signal detected: ${foundedYear}.`);
    } else if (earliestArchiveYear) {
      parts.push(`Earliest archive signal detected: ${earliestArchiveYear}.`);
    }

    if (peopleCount > 0) {
      parts.push(`Detected ${peopleCount} public team or leadership profiles on the target site.`);
    }

    return parts.length > 0 ? parts.join(" ") : undefined;
  }

  private pickOrganizationName(pages: PageIntel[]): string | undefined {
    const candidates = uniqueStrings(
      pages.flatMap((page) => [page.siteName ?? "", page.pageTitle ?? ""]),
    );

    return (
      candidates.find((value) => !/\b(docs|blog|support|careers)\b/i.test(value)) ??
      candidates[0]
    );
  }

  private async lookupEarliestArchiveYear(hostname: string): Promise<number | undefined> {
    const url =
      `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(hostname)}` +
      "&output=json&fl=timestamp&filter=statuscode:200&limit=1&from=1996";
    const response = await fetch(url, {
      headers: { "User-Agent": "ZeroTrace/0.1" },
      signal: AbortSignal.timeout(config.archiveLookupTimeoutMs),
    });

    if (!response.ok) {
      return undefined;
    }

    const payload = (await response.json()) as ArchiveResponseRow[][];
    const row = payload.at(1)?.at(0);

    if (!row) {
      return undefined;
    }

    const year = Number(String(row).slice(0, 4));
    return Number.isFinite(year) ? year : undefined;
  }

  private async fetchPage(url: string, targetHost: string): Promise<PageIntel | null> {
    try {
      const html = await fetchText(url);
      return this.parsePage(url, html, targetHost);
    } catch {
      return null;
    }
  }

  private parsePage(url: string, html: string, targetHost: string): PageIntel {
    const $ = cheerio.load(html);
    const title = cleanText($("title").first().text());
    const description =
      $('meta[name="description"]').attr("content") ??
      $('meta[property="og:description"]').attr("content");
    const siteName =
      $('meta[property="og:site_name"]').attr("content") ??
      cleanText($('script[type="application/ld+json"]').first().text());
    const summaryParagraph = extractTextContent($, "main p, article p, p")
      .find((value) => value.length > 80 && value.length < 320);
    const generator = $('meta[name="generator"]').attr("content") ?? undefined;
    const bodyText = cleanText($("body").text());
    const emails = uniqueStrings([
      ...extractEmails(bodyText),
      ...$('a[href^="mailto:"]')
        .map((_index, element) => $(element).attr("href")?.replace(/^mailto:/, "") ?? "")
        .get(),
    ]);
    const phones = uniqueStrings([
      ...extractPhones(bodyText),
      ...$('a[href^="tel:"]')
        .map((_index, element) => $(element).attr("href")?.replace(/^tel:/, "") ?? "")
        .get(),
    ]);
    const links = $("a[href]")
      .map((_index, element) => $(element).attr("href") ?? "")
      .get();
    const normalizedLinks = uniqueStrings(
      links
        .map((href) => normalizeUrl(href, url, targetHost))
        .filter((value): value is string => Boolean(value)),
    );
    const socialLinks = uniqueStrings(normalizedLinks.filter((value) => SOCIAL_HOST_PATTERN.test(value)));
    const relevantPages = uniquePages(
      $("a[href]")
        .map((_index, element) => {
          const href = $(element).attr("href") ?? "";
          const normalized = normalizeUrl(href, url, targetHost);
          const label = cleanText($(element).text()) || hostnameLabel(normalized ?? href);

          if (!normalized) {
            return null;
          }

          const matches = isInterestingPage(normalized, label);

          if (!matches) {
            return null;
          }

          return {
            label: label.length <= 32 ? label : hostnameLabel(normalized),
            url: normalized,
          };
        })
        .get()
        .filter((value): value is OrganizationPage => Boolean(value)),
    ).slice(0, config.maxOrganizationPages);
    const jsonLd = parseJsonLd($);
    const structuredPeople = extractStructuredPeople(jsonLd, url);
    const organizationSignals = extractOrganizationSignals(jsonLd, url);
    const heuristicPeople = extractHeuristicPeople($, url);
    const location =
      organizationSignals.location ??
      extractTextContent($, 'address, [itemprop="address"]')
        .find((value) => value.length > 8 && value.length < 120);

    return {
      url,
      label: hostnameLabel(url),
      pageTitle:
        (title.includes("|") ? cleanText(title.split("|").slice(-1)[0] ?? title) : title) || undefined,
      siteName:
        organizationSignals.name ??
        (siteName && siteName.startsWith("{") ? undefined : cleanText(siteName)) ??
        undefined,
      description: description ? cleanText(description) : undefined,
      summaryParagraph,
      generator,
      location,
      foundedYear:
        organizationSignals.foundedYear ??
        getYearFromText(bodyText.match(/\b(founded|established|since)[^.]{0,40}\b(19\d{2}|20\d{2})/i)?.[0] ?? ""),
      people: uniquePeople([...structuredPeople, ...organizationSignals.people, ...heuristicPeople]),
      emails,
      phones,
      socialLinks: uniqueStrings([...socialLinks, ...(organizationSignals.socialLinks ?? [])]),
      relevantPages,
    };
  }
}
