import { startTransition, useEffect, useState } from "react";
import { GraphPanel } from "./components/GraphPanel";
import { HistoryPanel } from "./components/HistoryPanel";
import { InsightCard } from "./components/InsightCard";
import { PipelinePanel } from "./components/PipelinePanel";
import { ResultSection } from "./components/ResultSection";
import { SearchBar } from "./components/SearchBar";
import { SecurityPanel } from "./components/SecurityPanel";
import { WatchPanel } from "./components/WatchPanel";
import {
  createWatchTarget,
  deleteWatchTarget,
  getReconJob,
  listWatchTargets,
  runWatchCheck,
  searchQuery,
  startReconJob,
} from "./lib/api";
import { loadHistory, saveHistory } from "./lib/history";
import { loadApiKey, saveApiKey } from "./lib/client-security";
import { exportSearchAsCsv, exportSearchAsJson } from "./lib/export";
import type { HistoryEntry, ReconJob, SearchResponse, WatchTarget } from "./lib/types";

const quickQueries = [
  "domain:mozilla.org sort:risk",
  "domain:example.com port:443 risk:medium",
  "subdomain:docs.github.com status:investigate",
  "ip:8.8.8.8",
];

const queryExamples = [
  "domain:example.com port:443 status:active risk:high",
  "domain:mozilla.org tech:wordpress sort:risk",
  "subdomain:api.example.com risk:medium",
  "domain:example.com limit:5 sort:ports",
  "company:mozilla",
  "sundar pichai",
];

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="metric-card">
      <div className="mono text-xs uppercase tracking-[0.3em] text-slate-500">{label}</div>
      <div className="mt-3 text-3xl font-semibold text-slate-50">{value}</div>
    </div>
  );
}

function ExternalLinkChip({ href, label }: { href: string; label: string }) {
  return (
    <a className="mini-chip" href={href} rel="noreferrer" target="_blank">
      {label}
    </a>
  );
}

function upsertWatchTarget(targets: WatchTarget[], next: WatchTarget): WatchTarget[] {
  return Array.from(new Map([next, ...targets].map((target) => [target.id, target])).values()).sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );
}

export default function App() {
  const [query, setQuery] = useState("domain:mozilla.org sort:risk");
  const [apiKey, setApiKey] = useState("");
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [watchTargets, setWatchTargets] = useState<WatchTarget[]>([]);
  const [activeJob, setActiveJob] = useState<ReconJob | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPipelineLoading, setIsPipelineLoading] = useState(false);
  const [isCreatingWatch, setIsCreatingWatch] = useState(false);
  const [activeWatchId, setActiveWatchId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setApiKey(loadApiKey());
    setHistory(loadHistory());
    void refreshWatchTargets();
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void refreshWatchTargets();
    }, 15000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!activeJob || (activeJob.status !== "queued" && activeJob.status !== "running")) {
      return;
    }

    const timeout = window.setTimeout(async () => {
      try {
        const nextJob = await getReconJob(activeJob.id);
        setActiveJob(nextJob);

        if (nextJob.status === "completed" && nextJob.result) {
          const completedResult = nextJob.result;

          startTransition(() => {
            setResult(completedResult);
            setHistory(saveHistory(nextJob.query, completedResult));
          });
          setIsPipelineLoading(false);
        }

        if (nextJob.status === "failed") {
          setError(nextJob.error ?? "Recon job failed.");
          setIsPipelineLoading(false);
        }
      } catch (jobError) {
        setError(jobError instanceof Error ? jobError.message : "Could not refresh recon job.");
        setIsPipelineLoading(false);
      }
    }, 1200);

    return () => window.clearTimeout(timeout);
  }, [activeJob]);

  async function executeSearch(nextQuery: string) {
    const normalized = nextQuery.trim();

    if (!normalized) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const nextResult = await searchQuery(normalized);
      startTransition(() => {
        setResult(nextResult);
        setQuery(normalized);
        setHistory(saveHistory(normalized, nextResult));
      });
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : "Search failed.");
    } finally {
      setIsLoading(false);
    }
  }

  async function launchPipeline(nextQuery: string) {
    const normalized = nextQuery.trim();

    if (!normalized) {
      return;
    }

    setIsPipelineLoading(true);
    setError(null);

    try {
      const job = await startReconJob(normalized);
      setActiveJob(job);
    } catch (jobError) {
      setError(jobError instanceof Error ? jobError.message : "Could not start recon pipeline.");
      setIsPipelineLoading(false);
    }
  }

  async function refreshWatchTargets() {
    try {
      const nextTargets = await listWatchTargets();
      setWatchTargets(nextTargets);
    } catch {
      // Keep the workbench usable even if watch refresh fails temporarily.
    }
  }

  async function handleWatchCurrent(nextQuery: string) {
    const normalized = nextQuery.trim();

    if (!normalized) {
      return;
    }

    setIsCreatingWatch(true);
    setError(null);

    try {
      const target = await createWatchTarget(normalized);
      startTransition(() => {
        setWatchTargets((current) => upsertWatchTarget(current, target));
      });
    } catch (watchError) {
      setError(watchError instanceof Error ? watchError.message : "Could not create watch target.");
    } finally {
      setIsCreatingWatch(false);
    }
  }

  async function handleRunWatchCheck(watchId: string) {
    setActiveWatchId(watchId);
    setError(null);

    try {
      const updated = await runWatchCheck(watchId);
      startTransition(() => {
        setWatchTargets((current) => upsertWatchTarget(current, updated));
      });
    } catch (watchError) {
      setError(watchError instanceof Error ? watchError.message : "Could not run watch check.");
    } finally {
      setActiveWatchId(null);
    }
  }

  async function handleDeleteWatch(watchId: string) {
    setActiveWatchId(watchId);
    setError(null);

    try {
      await deleteWatchTarget(watchId);
      startTransition(() => {
        setWatchTargets((current) => current.filter((target) => target.id !== watchId));
      });
    } catch (watchError) {
      setError(watchError instanceof Error ? watchError.message : "Could not delete watch target.");
    } finally {
      setActiveWatchId(null);
    }
  }

  function handleSaveApiKey(value: string) {
    const normalized = saveApiKey(value);
    setApiKey(normalized);
    void refreshWatchTargets();
  }

  const displayResult = activeJob?.result ?? result;

  return (
    <div className="min-h-screen px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
      <main className="screen-shell mx-auto max-w-[1600px] space-y-6">
        <header className="command-header">
          <div className="flex flex-wrap items-center gap-3">
            <div className="terminal-lights">
              <span className="terminal-light terminal-red" />
              <span className="terminal-light terminal-amber" />
              <span className="terminal-light terminal-green" />
            </div>
            <div>
              <p className="mono text-[11px] uppercase tracking-[0.35em] text-emerald-300">ReconPulse // Operator Console</p>
              <h1 className="mt-2 text-lg font-semibold text-slate-50 sm:text-xl">
                Passive recon intelligence for daily bug bounty work
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="console-chip">signal-first</span>
            <span className="console-chip">keyboard-driven</span>
            <span className="console-chip">
              {displayResult?.performance.cacheProvider ?? "memory"} cache
            </span>
            <span className="console-chip">
              {displayResult?.performance.jobProvider ?? "memory-worker"} worker
            </span>
          </div>
        </header>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_430px]">
          <div className="panel hero-panel">
            <div className="hero-grid">
              <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="badge">ReconPulse Intelligence Platform</div>
                  <div className="mission-pill">
                    <span className="status-dot" />
                    Daily recon. Higher signal.
                  </div>
                </div>

                <div className="max-w-5xl">
                  <h2 className="title-glow text-4xl font-semibold tracking-tight text-slate-50 sm:text-5xl">
                    Find bugs faster by cutting straight to risky surface area.
                  </h2>
                  <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300 sm:text-lg">
                    A hacker-centric reconnaissance workbench that turns passive OSINT into ranked
                    targets, live graph pivots, tech clues, and concrete places to inspect next.
                  </p>
                </div>

                <div className="terminal-panel">
                  <SearchBar
                    isLoading={isLoading}
                    isPipelineLoading={isPipelineLoading}
                    onLaunchPipeline={launchPipeline}
                    onQueryChange={setQuery}
                    onSearch={executeSearch}
                    query={query}
                  />
                </div>

                <div className="grid gap-3 lg:grid-cols-4">
                  {quickQueries.map((example) => (
                    <button
                      className="operator-card text-left"
                      key={example}
                      onClick={() => {
                        setQuery(example);
                        void executeSearch(example);
                      }}
                      type="button"
                    >
                      <div className="mono text-sm text-emerald-300">{example}</div>
                      <p className="mt-3 text-sm leading-6 text-slate-400">
                        Quick pivot for the query language and scoring workflow.
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              <aside className="hero-aside">
                <div className="telemetry-panel">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="mono text-[11px] uppercase tracking-[0.32em] text-slate-500">Live telemetry</p>
                      <h3 className="mt-2 text-lg font-semibold text-slate-50">Current session</h3>
                    </div>
                    <span className="metric-pill">{displayResult?.metadata.cached ? "cache hit" : "live"}</span>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="telemetry-cell">
                      <div className="mono text-[11px] uppercase tracking-[0.28em] text-slate-500">Latency</div>
                      <div className="mt-2 text-2xl font-semibold text-slate-50">
                        {displayResult ? `${displayResult.metadata.durationMs}ms` : "--"}
                      </div>
                    </div>
                    <div className="telemetry-cell">
                      <div className="mono text-[11px] uppercase tracking-[0.28em] text-slate-500">Ranked assets</div>
                      <div className="mt-2 text-2xl font-semibold text-slate-50">
                        {displayResult?.stats.insightCount ?? 0}
                      </div>
                    </div>
                    <div className="telemetry-cell">
                      <div className="mono text-[11px] uppercase tracking-[0.28em] text-slate-500">High probability</div>
                      <div className="mt-2 text-2xl font-semibold text-slate-50">
                        {displayResult?.stats.highProbabilityCount ?? 0}
                      </div>
                    </div>
                    <div className="telemetry-cell">
                      <div className="mono text-[11px] uppercase tracking-[0.28em] text-slate-500">Graph nodes</div>
                      <div className="mt-2 text-2xl font-semibold text-slate-50">
                        {displayResult?.graph.nodes.length ?? 0}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mission-strip grid gap-3">
                  <div className="mission-cell">
                    <div className="mono text-xs uppercase tracking-[0.3em] text-slate-500">Core philosophy</div>
                    <p className="mt-2 text-sm leading-6 text-slate-300">
                      Prioritize actionable intelligence over raw volume. Every screen should answer: where is the bug?
                    </p>
                  </div>
                  <div className="mission-cell">
                    <div className="mono text-xs uppercase tracking-[0.3em] text-slate-500">Automation</div>
                    <p className="mt-2 text-sm leading-6 text-slate-300">
                      Passive subdomain discovery, service enrichment, endpoint hints, scoring, and graph correlation in one pass.
                    </p>
                  </div>
                  <div className="mission-cell">
                    <div className="mono text-xs uppercase tracking-[0.3em] text-slate-500">Scale path</div>
                    <p className="mt-2 text-sm leading-6 text-slate-300">
                      Memory-first locally, Redis/BullMQ-ready when you want background workers and shared caching.
                    </p>
                  </div>
                </div>
              </aside>
            </div>
          </div>

          <div className="space-y-6">
            <section className="panel space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="mono text-xs uppercase tracking-[0.35em] text-cyan-300">Advanced Query Language</p>
                  <h2 className="mt-3 text-2xl font-semibold text-slate-50">Filter like a hunter</h2>
                </div>
                <span className="metric-pill">AQL</span>
              </div>
              <div className="space-y-3">
                {queryExamples.map((example) => (
                  <button
                    className="history-item w-full text-left"
                    key={example}
                    onClick={() => {
                      setQuery(example);
                      void executeSearch(example);
                    }}
                    type="button"
                  >
                    <div className="mono text-sm text-slate-100">{example}</div>
                    <div className="mt-2 text-xs leading-6 text-slate-400">
                      Supports chaining by risk, port, tech, status, sorting, and limit.
                    </div>
                  </button>
                ))}
              </div>
            </section>

            <PipelinePanel job={activeJob} pipeline={displayResult?.pipeline ?? null} />
          </div>
        </section>

        {error ? <div className="error-banner">{error}</div> : null}

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_430px]">
          <div className="space-y-6">
            {displayResult ? (
              <>
                <section className="panel space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="mono text-xs uppercase tracking-[0.32em] text-rose-300">Priority Board</p>
                      <h2 className="mt-3 text-2xl font-semibold text-slate-50">
                        High probability targets
                      </h2>
                    </div>
                    <span className="metric-pill">{displayResult.stats.highProbabilityCount} ranked</span>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
                    <StatCard label="Insights" value={displayResult.stats.insightCount} />
                    <StatCard label="High Probability" value={displayResult.stats.highProbabilityCount} />
                    <StatCard label="Subdomains" value={displayResult.stats.subdomainCount} />
                    <StatCard label="IPs" value={displayResult.stats.ipCount} />
                    <StatCard label="Open Ports" value={displayResult.stats.portCount} />
                    <StatCard label="People" value={displayResult.stats.peopleCount} />
                  </div>

                  <div className="space-y-4">
                    {(displayResult.highProbabilityTargets.length > 0
                      ? displayResult.highProbabilityTargets
                      : displayResult.insights.slice(0, 4)
                    ).map((insight) => (
                      <InsightCard insight={insight} key={insight.id} />
                    ))}
                  </div>
                </section>

                <section className="summary-deck">
                  <div className="summary-card">
                    <p className="mono text-[11px] uppercase tracking-[0.28em] text-slate-500">Applied filters</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {displayResult.filtersApplied.length > 0 ? (
                        displayResult.filtersApplied.map((filter) => (
                          <span className="mini-chip" key={filter}>
                            {filter}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-slate-500">none</span>
                      )}
                    </div>
                  </div>
                  <div className="summary-card">
                    <p className="mono text-[11px] uppercase tracking-[0.28em] text-slate-500">Export</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button className="chip-button" onClick={() => exportSearchAsJson(displayResult)} type="button">
                        JSON
                      </button>
                      <button className="chip-button" onClick={() => exportSearchAsCsv(displayResult)} type="button">
                        CSV
                      </button>
                    </div>
                  </div>
                  <div className="summary-card">
                    <p className="mono text-[11px] uppercase tracking-[0.28em] text-slate-500">Sources</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {displayResult.sources.map((source) => (
                        <span className="mini-chip" key={source}>
                          {source}
                        </span>
                      ))}
                    </div>
                  </div>
                </section>

                <GraphPanel graph={displayResult.graph} />

                <ResultSection
                  count={displayResult.insights.length}
                  eyebrow={`Filters applied: ${displayResult.filtersApplied.join(" · ") || "none"}`}
                  title="All Ranked Targets"
                >
                  <div className="space-y-4">
                    {displayResult.insights.map((insight) => (
                      <InsightCard insight={insight} key={insight.id} />
                    ))}
                  </div>
                </ResultSection>

                {displayResult.organization || displayResult.websiteProfile ? (
                  <ResultSection
                    count={
                      (displayResult.websiteProfile?.techStack.length ?? 0) +
                      (displayResult.websiteProfile?.endpoints.length ?? 0)
                    }
                    eyebrow="Public web intelligence"
                    title="Website fingerprint"
                  >
                    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.9fr)]">
                      <article className="asset-card space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <h3 className="text-xl font-semibold text-slate-50">
                              {displayResult.organization?.name ??
                                displayResult.websiteProfile?.baseUrl ??
                                "Website profile"}
                            </h3>
                            <p className="mt-2 text-sm text-slate-400">
                              {displayResult.organization?.summary ?? "Passive website intelligence collected from public pages only."}
                            </p>
                          </div>
                          <span className="tag">Web Intel</span>
                        </div>

                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="mission-cell">
                            <div className="mono text-xs uppercase tracking-[0.3em] text-slate-500">Founded year</div>
                            <div className="mt-2 text-sm text-slate-200">
                              {displayResult.organization?.foundedYear ?? "Not confirmed"}
                            </div>
                          </div>
                          <div className="mission-cell">
                            <div className="mono text-xs uppercase tracking-[0.3em] text-slate-500">Archive hint</div>
                            <div className="mt-2 text-sm text-slate-200">
                              {displayResult.organization?.earliestArchiveYear ?? "Not detected"}
                            </div>
                          </div>
                          <div className="mission-cell">
                            <div className="mono text-xs uppercase tracking-[0.3em] text-slate-500">Server</div>
                            <div className="mt-2 text-sm text-slate-200">
                              {displayResult.websiteProfile?.server ?? "Not exposed"}
                            </div>
                          </div>
                          <div className="mission-cell">
                            <div className="mono text-xs uppercase tracking-[0.3em] text-slate-500">Powered by</div>
                            <div className="mt-2 text-sm text-slate-200">
                              {displayResult.websiteProfile?.poweredBy ?? "Not exposed"}
                            </div>
                          </div>
                        </div>

                        <div>
                          <div className="mono text-xs uppercase tracking-[0.3em] text-slate-500">Tech stack</div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {displayResult.websiteProfile?.techStack.length ? (
                              displayResult.websiteProfile.techStack.map((technology) => (
                                <span className="mini-chip" key={`${technology.name}-${technology.source}`}>
                                  {technology.name}
                                </span>
                              ))
                            ) : (
                              <span className="text-xs text-slate-500">No web fingerprint captured</span>
                            )}
                          </div>
                        </div>

                        <div>
                          <div className="mono text-xs uppercase tracking-[0.3em] text-slate-500">Interesting endpoints</div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {displayResult.websiteProfile?.endpoints.length ? (
                              displayResult.websiteProfile.endpoints.slice(0, 12).map((endpoint) => (
                                <ExternalLinkChip href={endpoint.url} key={endpoint.url} label={endpoint.path} />
                              ))
                            ) : (
                              <span className="text-xs text-slate-500">No endpoint hints</span>
                            )}
                          </div>
                        </div>
                      </article>

                      <article className="asset-card space-y-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <h3 className="text-lg font-semibold text-slate-50">Public people & pages</h3>
                            <p className="mt-2 text-sm text-slate-400">
                              Limited to what the target website publishes directly.
                            </p>
                          </div>
                          <span className="metric-pill">{displayResult.organization?.people.length ?? 0}</span>
                        </div>

                        <div className="space-y-3">
                          {displayResult.organization?.people.length ? (
                            displayResult.organization.people.slice(0, 10).map((person) => (
                              <div className="history-item" key={`${person.name}-${person.role ?? ""}`}>
                                <div className="mono text-sm text-slate-50">{person.name}</div>
                                <div className="mt-2 text-xs text-slate-400">{person.role ?? "Public listing"}</div>
                              </div>
                            ))
                          ) : (
                            <p className="text-sm text-slate-400">No public team listings detected on the target site.</p>
                          )}
                        </div>

                        <div>
                          <div className="mono text-xs uppercase tracking-[0.3em] text-slate-500">Relevant pages</div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {displayResult.organization?.relevantPages.length ? (
                              displayResult.organization.relevantPages.map((page) => (
                                <ExternalLinkChip href={page.url} key={page.url} label={page.label} />
                              ))
                            ) : (
                              <span className="text-xs text-slate-500">No organization pages</span>
                            )}
                          </div>
                        </div>
                      </article>
                    </div>
                  </ResultSection>
                ) : null}

                {displayResult.externalProfiles.length > 0 ? (
                  <ResultSection
                    count={displayResult.externalProfiles.length}
                    eyebrow="External public OSINT"
                    title="Public profiles and company enrichment"
                  >
                    <div className="grid gap-4 xl:grid-cols-2">
                      {displayResult.externalProfiles.map((profile) => (
                        <article className="asset-card space-y-4" key={profile.id}>
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-xl font-semibold text-slate-50">{profile.name}</h3>
                                <span className="tag">{profile.kind}</span>
                              </div>
                              <p className="mt-2 text-sm text-slate-400">
                                {profile.summary ?? profile.description ?? "Public profile data from external passive sources."}
                              </p>
                            </div>
                            <span className="metric-pill">{profile.confidence} confidence</span>
                          </div>

                          {profile.facts.length > 0 ? (
                            <div className="grid gap-3 sm:grid-cols-2">
                              {profile.facts.slice(0, 6).map((fact) => (
                                <div className="mission-cell" key={`${profile.id}-${fact.label}-${fact.value}`}>
                                  <div className="mono text-xs uppercase tracking-[0.3em] text-slate-500">{fact.label}</div>
                                  {fact.href ? (
                                    <a
                                      className="mt-2 inline-flex text-sm text-emerald-300 hover:text-emerald-200"
                                      href={fact.href}
                                      rel="noreferrer"
                                      target="_blank"
                                    >
                                      {fact.value}
                                    </a>
                                  ) : (
                                    <div className="mt-2 text-sm text-slate-200">{fact.value}</div>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : null}

                          {profile.aliases.length > 0 ? (
                            <div>
                              <div className="mono text-xs uppercase tracking-[0.3em] text-slate-500">Aliases</div>
                              <div className="mt-3 flex flex-wrap gap-2">
                                {profile.aliases.slice(0, 8).map((alias) => (
                                  <span className="mini-chip" key={`${profile.id}-${alias}`}>
                                    {alias}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ) : null}

                          {profile.people.length > 0 ? (
                            <div>
                              <div className="mono text-xs uppercase tracking-[0.3em] text-slate-500">Public people</div>
                              <div className="mt-3 space-y-3">
                                {profile.people.slice(0, 8).map((person) => (
                                  <div className="history-item" key={`${profile.id}-${person.name}-${person.role ?? ""}`}>
                                    <div className="mono text-sm text-slate-50">{person.name}</div>
                                    <div className="mt-2 text-xs text-slate-400">{person.role ?? "Public profile"}</div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}

                          {profile.links.length > 0 ? (
                            <div>
                              <div className="mono text-xs uppercase tracking-[0.3em] text-slate-500">External links</div>
                              <div className="mt-3 flex flex-wrap gap-2">
                                {profile.links.map((link) => (
                                  <ExternalLinkChip href={link.url} key={`${profile.id}-${link.url}`} label={link.label} />
                                ))}
                              </div>
                            </div>
                          ) : null}

                          {profile.notes.length > 0 ? (
                            <div className="rounded-2xl border border-slate-800/80 bg-slate-950/40 px-4 py-3 text-xs leading-6 text-slate-400">
                              {profile.notes.join(" ")}
                            </div>
                          ) : null}
                        </article>
                      ))}
                    </div>
                  </ResultSection>
                ) : null}
              </>
            ) : (
              <>
                <section className="panel space-y-4">
                  <div className="badge">Ready</div>
                  <h2 className="text-3xl font-semibold text-slate-50">
                    Start with a target and let the intelligence layer do the ranking
                  </h2>
                  <p className="max-w-3xl text-sm leading-7 text-slate-400">
                    ReconPulse automatically collects passive signals, scores risky assets, surfaces likely takeover candidates or exposed services, and tells you where to look next.
                  </p>
                </section>

                <section className="summary-deck">
                  <div className="summary-card">
                    <p className="mono text-[11px] uppercase tracking-[0.28em] text-slate-500">Mode</p>
                    <div className="mt-2 text-lg font-semibold text-slate-50">Passive recon</div>
                  </div>
                  <div className="summary-card">
                    <p className="mono text-[11px] uppercase tracking-[0.28em] text-slate-500">Views</p>
                    <div className="mt-2 text-lg font-semibold text-slate-50">Rank · Graph · Pipeline</div>
                  </div>
                  <div className="summary-card">
                    <p className="mono text-[11px] uppercase tracking-[0.28em] text-slate-500">Designed for</p>
                    <div className="mt-2 text-lg font-semibold text-slate-50">Bug bounty hunters</div>
                  </div>
                </section>

                <GraphPanel graph={{ nodes: [], edges: [] }} />
              </>
            )}
          </div>

          <div className="space-y-6">
            <WatchPanel
              activeTargetId={activeWatchId}
              currentQuery={query}
              onDelete={handleDeleteWatch}
              onReplay={(replayQuery) => {
                setQuery(replayQuery);
                void executeSearch(replayQuery);
              }}
              onRunCheck={handleRunWatchCheck}
              onWatchCurrent={handleWatchCurrent}
              targets={watchTargets}
              watchingQuery={isCreatingWatch}
            />

            <SecurityPanel apiKey={apiKey} onSaveApiKey={handleSaveApiKey} />

            <HistoryPanel
              history={history}
              onReplay={(replayQuery) => {
                setQuery(replayQuery);
                void executeSearch(replayQuery);
              }}
            />

            <section className="panel space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="mono text-xs uppercase tracking-[0.32em] text-slate-500">Why it helps daily</p>
                  <h2 className="mt-2 text-xl font-semibold text-slate-50">Where to look</h2>
                </div>
                <span className="metric-pill">{displayResult?.suggestions.length ?? 0}</span>
              </div>
              <div className="space-y-3">
                {displayResult?.suggestions.length ? (
                  displayResult.suggestions.map((suggestion) => (
                    <div className="history-item" key={suggestion}>
                      <div className="text-sm text-slate-200">{suggestion}</div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-400">
                    Suggestions appear once ReconPulse has enough signal to rank a target confidently.
                  </p>
                )}
              </div>
            </section>

            <section className="panel space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="mono text-xs uppercase tracking-[0.32em] text-slate-500">Performance</p>
                  <h2 className="mt-2 text-xl font-semibold text-slate-50">Cache, queue, index</h2>
                </div>
                <span className="metric-pill">Scale path</span>
              </div>
              <div className="space-y-3">
                <div className="history-item">
                  <div className="mono text-sm text-slate-50">Cache</div>
                  <p className="mt-2 text-xs leading-6 text-slate-400">
                    {displayResult?.performance.cacheProvider ?? "memory"} cache provider
                  </p>
                </div>
                <div className="history-item">
                  <div className="mono text-sm text-slate-50">Worker queue</div>
                  <p className="mt-2 text-xs leading-6 text-slate-400">
                    {displayResult?.performance.jobProvider ?? activeJob?.status ?? "memory-worker"} job provider
                  </p>
                </div>
                <div className="history-item">
                  <div className="mono text-sm text-slate-50">Indexing</div>
                  <p className="mt-2 text-xs leading-6 text-slate-400">
                    {displayResult?.performance.indexingProvider ?? "in-memory index (Meilisearch-ready)"}
                  </p>
                </div>
              </div>
            </section>

            {displayResult?.notes.length ? (
              <section className="panel space-y-4">
                <h2 className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-300">Notes</h2>
                <div className="space-y-3">
                  {displayResult.notes.map((note) => (
                    <div className="panel-outline rounded-2xl px-4 py-3 text-sm text-slate-400" key={note}>
                      {note}
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        </section>
      </main>
    </div>
  );
}
