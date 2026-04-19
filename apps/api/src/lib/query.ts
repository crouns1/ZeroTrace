import type { AssetStatus, ParsedQuery, RiskLevel, SearchOperator, SortMode } from "../types.js";

const tokenRegex = /\b([a-z_]+):([^\s]+)/gi;
const domainRegex =
  /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/i;
const ipv4Regex =
  /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

const allowedStatuses = new Set<AssetStatus>(["active", "investigate", "watch", "stale"]);
const allowedRiskLevels = new Set<RiskLevel>(["critical", "high", "medium", "low"]);
const allowedSortModes = new Set<SortMode>(["risk", "ports", "recent", "alphabetical"]);

function parseNumber(value: string): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseQuery(input: string): ParsedQuery {
  const raw = input.trim().slice(0, 300);

  if (!raw) {
    throw new Error("A search query is required.");
  }

  const filters: ParsedQuery["filters"] = {};
  const recognizedFilters: string[] = [];
  const terms = raw.split(/\s+/).filter(Boolean);
  let primaryOperator: SearchOperator | null = null;
  let primaryValue = raw.toLowerCase();

  for (const match of raw.matchAll(tokenRegex)) {
    const key = match[1]?.toLowerCase();
    const value = match[2]?.trim().toLowerCase();

    if (!key || !value) {
      continue;
    }

    if (key === "domain" && isDomainLike(value)) {
      filters.domain = value;
      recognizedFilters.push(`domain:${value}`);
      primaryOperator ??= "domain";
      primaryValue = value;
      continue;
    }

    if (key === "subdomain" && isDomainLike(value)) {
      filters.subdomain = value;
      recognizedFilters.push(`subdomain:${value}`);
      primaryOperator ??= "subdomain";
      primaryValue = value;
      continue;
    }

    if (key === "ip" && isIpLike(value)) {
      filters.ip = value;
      recognizedFilters.push(`ip:${value}`);
      primaryOperator ??= "ip";
      primaryValue = value;
      continue;
    }

    if (key === "port") {
      const parsed = parseNumber(value);

      if (parsed) {
        filters.port = parsed;
        recognizedFilters.push(`port:${parsed}`);
      }

      continue;
    }

    if (key === "status" && allowedStatuses.has(value as AssetStatus)) {
      filters.status = value as AssetStatus;
      recognizedFilters.push(`status:${value}`);
      continue;
    }

    if (key === "risk" && allowedRiskLevels.has(value as RiskLevel)) {
      filters.risk = value as RiskLevel;
      recognizedFilters.push(`risk:${value}`);
      continue;
    }

    if (key === "tech") {
      filters.tech = value;
      recognizedFilters.push(`tech:${value}`);
      continue;
    }

    if (key === "sort" && allowedSortModes.has(value as SortMode)) {
      filters.sort = value as SortMode;
      recognizedFilters.push(`sort:${value}`);
      continue;
    }

    if (key === "limit") {
      const parsed = parseNumber(value);

      if (parsed && parsed > 0) {
        filters.limit = Math.min(parsed, 50);
        recognizedFilters.push(`limit:${filters.limit}`);
      }
    }
  }

  if (!primaryOperator) {
    const lowered = raw.toLowerCase();

    if (isIpLike(lowered)) {
      primaryOperator = "ip";
      primaryValue = lowered;
      filters.ip = lowered;
    } else if (isDomainLike(lowered)) {
      primaryOperator = "domain";
      primaryValue = lowered;
      filters.domain = lowered;
    } else {
      primaryOperator = "text";
      primaryValue = lowered;
    }
  }

  return {
    raw,
    operator: primaryOperator,
    value: primaryValue,
    filters,
    terms,
    recognizedFilters,
  };
}

export function isDomainLike(value: string): boolean {
  return domainRegex.test(value.toLowerCase());
}

export function isIpLike(value: string): boolean {
  return ipv4Regex.test(value);
}
