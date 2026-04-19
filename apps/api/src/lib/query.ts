import type { ParsedQuery, SearchOperator } from "../types.js";

const operatorRegex = /\b(domain|subdomain|ip):([^\s]+)/gi;
const domainRegex =
  /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/i;
const ipv4Regex =
  /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

export function parseQuery(input: string): ParsedQuery {
  const raw = input.trim().slice(0, 200);

  if (!raw) {
    throw new Error("A search query is required.");
  }

  const filters: ParsedQuery["filters"] = {};
  const terms = raw.split(/\s+/).filter(Boolean);
  let primaryOperator: SearchOperator | null = null;
  let primaryValue = raw;

  for (const match of raw.matchAll(operatorRegex)) {
    const operator = match[1]?.toLowerCase() as SearchOperator | undefined;
    const value = match[2]?.trim().toLowerCase();

    if (!operator || !value) {
      continue;
    }

    if (operator === "domain") {
      filters.domain = value;
    }

    if (operator === "subdomain") {
      filters.subdomain = value;
    }

    if (operator === "ip") {
      filters.ip = value;
    }

    if (!primaryOperator) {
      primaryOperator = operator;
      primaryValue = value;
    }
  }

  if (!primaryOperator) {
    const lowered = raw.toLowerCase();

    if (ipv4Regex.test(lowered)) {
      primaryOperator = "ip";
      primaryValue = lowered;
      filters.ip = lowered;
    } else if (domainRegex.test(lowered)) {
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
  };
}

export function isDomainLike(value: string): boolean {
  return domainRegex.test(value.toLowerCase());
}

