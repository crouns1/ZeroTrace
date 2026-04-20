import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import type {
  FindingSeverity,
  PublicPerson,
  SearchResponse,
  WatchChange,
  WatchSnapshot,
  WatchTarget,
} from "../types.js";
import { SearchService } from "./search-service.js";

interface WatchRecord {
  target: WatchTarget;
  latestResult?: SearchResponse;
}

const severityRank: Record<FindingSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

function createWatchLabel(query: string): string {
  return query.length > 56 ? `${query.slice(0, 56)}...` : query;
}

function createChange(
  kind: WatchChange["kind"],
  severity: WatchChange["severity"],
  label: string,
  detail: string,
  observedAt: string,
): WatchChange {
  return {
    id: `${kind}:${label.toLowerCase()}`,
    kind,
    severity,
    label,
    detail,
    observedAt,
  };
}

function collectPeople(response: SearchResponse): PublicPerson[] {
  return Array.from(
    new Map(
      [
        ...(response.organization?.people ?? []),
        ...response.externalProfiles.flatMap((profile) => profile.people),
      ].map((person) => [`${person.name.toLowerCase()}:${(person.role ?? "").toLowerCase()}`, person]),
    ).values(),
  );
}

function setDifference(current: Set<string>, previous: Set<string>): string[] {
  return Array.from(current).filter((value) => !previous.has(value)).sort((left, right) => left.localeCompare(right));
}

function isSensitiveEndpoint(path: string): boolean {
  return /(admin|graphql|api|debug|internal|login|auth)/i.test(path);
}

function isInterestingPort(port: number): boolean {
  return ![80, 443].includes(port);
}

function buildWatchChanges(previous: SearchResponse | undefined, next: SearchResponse): WatchChange[] {
  if (!previous) {
    return [];
  }

  const observedAt = new Date().toISOString();
  const changes: WatchChange[] = [];

  const previousSubdomains = new Set(previous.subdomains.map((entry) => entry.hostname));
  const nextSubdomains = new Set(next.subdomains.map((entry) => entry.hostname));

  for (const hostname of setDifference(nextSubdomains, previousSubdomains)) {
    changes.push(
      createChange(
        "subdomain-added",
        "medium",
        hostname,
        "New subdomain appeared in passive recon sources.",
        observedAt,
      ),
    );
  }

  for (const hostname of setDifference(previousSubdomains, nextSubdomains)) {
    changes.push(
      createChange(
        "subdomain-removed",
        "info",
        hostname,
        "Previously observed subdomain no longer appears in the latest snapshot.",
        observedAt,
      ),
    );
  }

  const previousIps = new Set(previous.ipAddresses.map((entry) => entry.address));
  const nextIps = new Set(next.ipAddresses.map((entry) => entry.address));

  for (const ip of setDifference(nextIps, previousIps)) {
    changes.push(
      createChange("ip-added", "medium", ip, "New IP surfaced for the watched target.", observedAt),
    );
  }

  const previousPorts = new Set(previous.openPorts.map((entry) => `${entry.ip}:${entry.port}`));
  const nextPorts = new Set(next.openPorts.map((entry) => `${entry.ip}:${entry.port}`));

  for (const key of setDifference(nextPorts, previousPorts)) {
    const [ip, portValue] = key.split(":");
    const port = Number(portValue);
    changes.push(
      createChange(
        "port-opened",
        isInterestingPort(port) ? "high" : "medium",
        `${ip}:${port}`,
        `Open port ${port} is newly visible on ${ip}.`,
        observedAt,
      ),
    );
  }

  for (const key of setDifference(previousPorts, nextPorts)) {
    const [ip, portValue] = key.split(":");
    const port = Number(portValue);
    changes.push(
      createChange(
        "port-closed",
        "info",
        `${ip}:${port}`,
        `Previously visible port ${port} is no longer present on ${ip}.`,
        observedAt,
      ),
    );
  }

  const previousTech = new Set((previous.websiteProfile?.techStack ?? []).map((item) => item.name.toLowerCase()));
  const nextTech = new Map(
    (next.websiteProfile?.techStack ?? []).map((item) => [item.name.toLowerCase(), item]),
  );

  for (const technology of Array.from(nextTech.values()).filter((item) => !previousTech.has(item.name.toLowerCase()))) {
    changes.push(
      createChange(
        "tech-added",
        technology.historicalCves.length > 0 ? "high" : "medium",
        technology.name,
        technology.historicalCves.length > 0
          ? "New technology fingerprint has historical CVE references."
          : "New technology fingerprint appeared in the latest website profile.",
        observedAt,
      ),
    );
  }

  const previousPeople = new Set(
    collectPeople(previous).map((person) => `${person.name.toLowerCase()}:${(person.role ?? "").toLowerCase()}`),
  );

  for (const person of collectPeople(next)) {
    const key = `${person.name.toLowerCase()}:${(person.role ?? "").toLowerCase()}`;

    if (previousPeople.has(key)) {
      continue;
    }

    changes.push(
      createChange(
        "person-added",
        "info",
        person.name,
        person.role ? `New public person signal: ${person.role}.` : "New public person signal surfaced.",
        observedAt,
      ),
    );
  }

  const previousEndpoints = new Set((previous.websiteProfile?.endpoints ?? []).map((endpoint) => endpoint.path));
  const nextEndpoints = new Set((next.websiteProfile?.endpoints ?? []).map((endpoint) => endpoint.path));

  for (const endpoint of setDifference(nextEndpoints, previousEndpoints)) {
    changes.push(
      createChange(
        "endpoint-added",
        isSensitiveEndpoint(endpoint) ? "high" : "medium",
        endpoint,
        "New endpoint hint appeared in the latest website profile.",
        observedAt,
      ),
    );
  }

  const previousHighProbability = new Set(previous.highProbabilityTargets.map((item) => item.label));
  const nextHighProbability = new Set(next.highProbabilityTargets.map((item) => item.label));

  for (const target of setDifference(nextHighProbability, previousHighProbability)) {
    changes.push(
      createChange(
        "high-probability-added",
        "critical",
        target,
        "Asset entered the high-probability target set.",
        observedAt,
      ),
    );
  }

  return changes.sort(
    (left, right) =>
      severityRank[left.severity] - severityRank[right.severity] || left.label.localeCompare(right.label),
  );
}

function toPublicTarget(record: WatchRecord): WatchTarget {
  return {
    ...record.target,
    latestSnapshot: record.target.latestSnapshot
      ? {
          ...record.target.latestSnapshot,
          changes: [...record.target.latestSnapshot.changes],
          stats: { ...record.target.latestSnapshot.stats },
        }
      : undefined,
    snapshots: record.target.snapshots.map((snapshot) => ({
      ...snapshot,
      changes: [...snapshot.changes],
      stats: { ...snapshot.stats },
    })),
  };
}

export class WatchService {
  private readonly watches = new Map<string, WatchRecord>();

  constructor(
    private readonly searchService: SearchService,
    private readonly jobProviderName: string,
  ) {
    if (config.watchIntervalMs > 0) {
      const timer = setInterval(() => {
        void this.runDueChecks();
      }, Math.min(config.watchIntervalMs, 60_000));

      timer.unref?.();
    }
  }

  list(): WatchTarget[] {
    return Array.from(this.watches.values())
      .map(toPublicTarget)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  get(id: string): WatchTarget | undefined {
    const record = this.watches.get(id);
    return record ? toPublicTarget(record) : undefined;
  }

  async create(query: string, label?: string): Promise<WatchTarget> {
    const normalizedQuery = query.trim();

    if (!normalizedQuery) {
      throw new Error("A watch query is required.");
    }

    const existing = Array.from(this.watches.values()).find((entry) => entry.target.query === normalizedQuery);

    if (existing) {
      if (label?.trim()) {
        existing.target.label = label.trim();
        existing.target.updatedAt = new Date().toISOString();
      }

      if (!existing.target.latestSnapshot || existing.target.status === "failed") {
        return this.runCheck(existing.target.id);
      }

      return toPublicTarget(existing);
    }

    const now = new Date().toISOString();
    const target: WatchTarget = {
      id: randomUUID(),
      query: normalizedQuery,
      label: label?.trim() || createWatchLabel(normalizedQuery),
      createdAt: now,
      updatedAt: now,
      status: "idle",
      autoRefreshIntervalMs: config.watchIntervalMs,
      nextCheckAt:
        config.watchIntervalMs > 0 ? new Date(Date.now() + config.watchIntervalMs).toISOString() : undefined,
      snapshots: [],
    };
    this.watches.set(target.id, { target });

    return this.runCheck(target.id);
  }

  async runCheck(id: string): Promise<WatchTarget> {
    const record = this.watches.get(id);

    if (!record) {
      throw new Error("Watch target not found.");
    }

    if (record.target.status === "running") {
      return toPublicTarget(record);
    }

    const startedAt = Date.now();
    const startedIso = new Date().toISOString();
    record.target.status = "running";
    record.target.updatedAt = startedIso;
    record.target.lastError = undefined;

    try {
      const response = await this.searchService.search(record.target.query, {
        jobProviderName: this.jobProviderName,
        mode: "sync",
      });
      const checkedAt = new Date().toISOString();
      const changes = buildWatchChanges(record.latestResult, response);
      const snapshot: WatchSnapshot = {
        id: randomUUID(),
        createdAt: checkedAt,
        durationMs: Date.now() - startedAt,
        stats: { ...response.stats },
        changeCount: changes.length,
        changes,
      };

      record.latestResult = response;
      record.target.status = "completed";
      record.target.lastCheckedAt = checkedAt;
      record.target.nextCheckAt =
        config.watchIntervalMs > 0 ? new Date(Date.now() + config.watchIntervalMs).toISOString() : undefined;
      record.target.updatedAt = checkedAt;
      record.target.latestSnapshot = snapshot;
      record.target.snapshots = [snapshot, ...record.target.snapshots].slice(0, config.watchMaxSnapshots);
      return toPublicTarget(record);
    } catch (error) {
      const failedAt = new Date().toISOString();
      record.target.status = "failed";
      record.target.lastError = error instanceof Error ? error.message : "Watch check failed.";
      record.target.updatedAt = failedAt;
      record.target.nextCheckAt =
        config.watchIntervalMs > 0 ? new Date(Date.now() + config.watchIntervalMs).toISOString() : undefined;
      return toPublicTarget(record);
    }
  }

  delete(id: string): boolean {
    return this.watches.delete(id);
  }

  getSummary(): { count: number; intervalMs: number } {
    return {
      count: this.watches.size,
      intervalMs: config.watchIntervalMs,
    };
  }

  private async runDueChecks(): Promise<void> {
    const now = Date.now();

    for (const record of this.watches.values()) {
      if (record.target.status === "running" || !record.target.nextCheckAt) {
        continue;
      }

      if (new Date(record.target.nextCheckAt).getTime() > now) {
        continue;
      }

      try {
        await this.runCheck(record.target.id);
      } catch {
        // Keep the watch service resilient; individual target failures surface on the target itself.
      }
    }
  }
}
