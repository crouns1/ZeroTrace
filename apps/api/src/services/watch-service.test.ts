import assert from "node:assert/strict";
import test from "node:test";
import type { SearchResponse } from "../types.js";
import { computeWatchChanges } from "./watch-service.js";

function createResponse(partial: Partial<SearchResponse>): SearchResponse {
  return {
    query: {
      raw: "domain:example.com",
      operator: "domain",
      value: "example.com",
      filters: { domain: "example.com" },
      terms: ["domain:example.com"],
      recognizedFilters: ["domain:example.com"],
    },
    domains: [],
    subdomains: [],
    ipAddresses: [],
    organization: null,
    websiteProfile: null,
    externalProfiles: [],
    insights: [],
    highProbabilityTargets: [],
    openPorts: [],
    relatedAssets: [],
    sources: [],
    notes: [],
    graph: { nodes: [], edges: [] },
    pipeline: { mode: "sync", status: "completed", stages: [] },
    suggestions: [],
    filtersApplied: [],
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
      durationMs: 1,
      disclaimer: "test",
    },
    performance: {
      cacheProvider: "memory",
      jobProvider: "memory-worker",
      indexingProvider: "memory",
    },
    exportFormats: ["json", "csv"],
    ...partial,
  };
}

test("computeWatchChanges detects new ports and high probability targets", () => {
  const previous = createResponse({
    openPorts: [{ ip: "1.1.1.1", port: 443, source: "test" }],
    highProbabilityTargets: [],
  });
  const next = createResponse({
    openPorts: [
      { ip: "1.1.1.1", port: 443, source: "test" },
      { ip: "1.1.1.1", port: 8443, source: "test" },
    ],
    highProbabilityTargets: [
      {
        id: "subdomain:api.example.com",
        label: "api.example.com",
        assetType: "subdomain",
        hostname: "api.example.com",
        hostnames: ["api.example.com"],
        ipAddresses: ["1.1.1.1"],
        openPorts: [8443],
        linkedServiceLabels: [],
        techStack: [],
        findings: [],
        whereToLook: [],
        riskScore: 82,
        riskLevel: "high",
        status: "investigate",
        likelyVulnerable: true,
        sourceCount: 1,
        sources: ["test"],
      },
    ],
  });

  const changes = computeWatchChanges(previous, next);

  assert.ok(changes.some((change) => change.kind === "port-opened" && change.label === "1.1.1.1:8443"));
  assert.ok(
    changes.some((change) => change.kind === "high-probability-added" && change.label === "api.example.com"),
  );
});
