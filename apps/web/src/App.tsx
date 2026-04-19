import { useEffect, useState } from "react";
import { HistoryPanel } from "./components/HistoryPanel";
import { ResultSection } from "./components/ResultSection";
import { SearchBar } from "./components/SearchBar";
import { searchQuery } from "./lib/api";
import { loadHistory, saveHistory } from "./lib/history";
import type { HistoryEntry, SearchResponse } from "./lib/types";

const quickQueries = [
  "domain:example.com",
  "subdomain:api.example.com",
  "ip:8.8.8.8",
];

const operatorGuides = [
  {
    label: "domain:",
    title: "Apex mapping",
    description: "Start with a root target and resolve it into hosts, CT evidence, IPs, and passive exposure.",
  },
  {
    label: "subdomain:",
    title: "Precision pivots",
    description: "Investigate a single hostname when you already know the most interesting surface.",
  },
  {
    label: "ip:",
    title: "Passive host intel",
    description: "Pull reverse hostnames, open ports, and tags without active scanning.",
  },
];

const zeroTraceAdvantages = [
  {
    title: "Operator-first",
    description: "Built around `domain:`, `subdomain:` and `ip:` rather than chat prompts or analyst-heavy forms.",
  },
  {
    title: "Recon-native output",
    description: "Returns domains, subdomains, IPs, ports, and related assets as first-class investigation objects.",
  },
  {
    title: "Source-transparent",
    description: "Every result keeps provenance visible so researchers can pivot fast and verify fast.",
  },
];

const googlePeerBenchmarks = [
  {
    product: "Google Search AI Mode",
    bestAt: "Broad reasoning, dynamic layouts, voice/live interaction, and web-scale query fan-out.",
    zeroTraceEdge: "Zero Trace is narrower but much better aligned to recon workflows, structured asset discovery, and operator-driven pivots.",
    fit: "Use Search AI Mode for wide exploration. Use Zero Trace when the job is passive asset mapping and triage.",
  },
  {
    product: "NotebookLM",
    bestAt: "Source-grounded research workspaces with generated notes, mind maps, audio, video, and slide outputs.",
    zeroTraceEdge: "Zero Trace discovers internet-facing assets from public data; NotebookLM organizes sources you already have.",
    fit: "Use NotebookLM after collection. Use Zero Trace before collection to find what to investigate.",
  },
  {
    product: "Google Threat Intelligence / VirusTotal",
    bestAt: "Threat intel depth, IOC reputation, actor context, malware visibility, and enterprise investigation workflows.",
    zeroTraceEdge: "Zero Trace is faster and lighter for bug bounty recon where the goal is exposure discovery rather than full enterprise threat intelligence.",
    fit: "Use GTI/VT for deep IOC validation and campaign context. Use Zero Trace for hacker-speed asset enumeration.",
  },
];

const roadmapSignals = [
  "Realtime source refresh and background enrichment workers",
  "Saved views, exports, and collaborative investigations",
  "Optional accounts, API keys, and premium source connectors",
  "Custom query builder and programmable search pipelines",
];

const benchmarkReviewDate = "Benchmark reviewed against Google product docs on April 19, 2026.";

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="metric-card">
      <div className="mono text-xs uppercase tracking-[0.3em] text-slate-500">{label}</div>
      <div className="mt-3 text-3xl font-semibold text-slate-50">{value}</div>
    </div>
  );
}

function ExternalLinkCard({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <a className="mini-chip" href={href} rel="noreferrer" target="_blank">
      {label}
    </a>
  );
}

export default function App() {
  const [query, setQuery] = useState("domain:example.com");
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  async function executeSearch(nextQuery: string) {
    const normalized = nextQuery.trim();

    if (!normalized) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const nextResult = await searchQuery(normalized);
      setResult(nextResult);
      setQuery(normalized);
      setHistory(saveHistory(normalized, nextResult));
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : "Search failed.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
      <main className="mx-auto max-w-7xl space-y-6">
        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_420px]">
          <div className="panel hero-panel">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="badge">2026 Recon Workbench</div>
              <div className="mission-pill">
                <span className="status-dot" />
                Passive. Fast. Operator-first.
              </div>
            </div>

            <div className="mt-6 max-w-4xl">
              <h1 className="title-glow text-4xl font-semibold tracking-tight text-slate-50 sm:text-5xl">
                Zero Trace
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
                The specialized search engine for bug bounty hunters and security researchers who
                need structured passive recon, not generic AI summaries. Query public sources,
                pivot through exposure signals, and move from target to investigation in seconds.
              </p>
            </div>

            <div className="mt-8">
              <SearchBar
                isLoading={isLoading}
                onQueryChange={setQuery}
                onSearch={executeSearch}
                query={query}
              />
            </div>

            <div className="mt-6 grid gap-3 lg:grid-cols-3">
              {operatorGuides.map((guide) => (
                <article className="operator-card" key={guide.label}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="mono text-sm text-emerald-300">{guide.label}</span>
                    <span className="tag">{guide.title}</span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-400">{guide.description}</p>
                </article>
              ))}
            </div>

            <div className="mission-strip mt-6 grid gap-3 md:grid-cols-3">
              <div className="mission-cell">
                <div className="mono text-xs uppercase tracking-[0.3em] text-slate-500">Why now</div>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Search is getting more agentic in 2026, but recon still needs terse, source-aware, structured output.
                </p>
              </div>
              <div className="mission-cell">
                <div className="mono text-xs uppercase tracking-[0.3em] text-slate-500">How we win</div>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Narrow scope, stronger defaults, and zero ambiguity about assets, ports, and pivots.
                </p>
              </div>
              <div className="mission-cell">
                <div className="mono text-xs uppercase tracking-[0.3em] text-slate-500">Search templates</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {quickQueries.map((quickQuery) => (
                    <button
                      className="chip-button"
                      key={quickQuery}
                      onClick={() => {
                        setQuery(quickQuery);
                        void executeSearch(quickQuery);
                      }}
                      type="button"
                    >
                      {quickQuery}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <section className="panel space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="mono text-xs uppercase tracking-[0.35em] text-cyan-300">
                    Zero Trace Vs Google
                  </p>
                  <h2 className="mt-3 text-2xl font-semibold text-slate-50">Positioned to win on recon</h2>
                </div>
                <span className="metric-pill">3 peers</span>
              </div>

              <div className="space-y-3">
                {googlePeerBenchmarks.map((peer) => (
                  <article className="benchmark-card" key={peer.product}>
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-base font-semibold text-slate-50">{peer.product}</h3>
                      <span className="tag">Peer</span>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-400">
                      <span className="text-slate-200">Best at:</span> {peer.bestAt}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-emerald-200/90">
                      <span className="text-emerald-300">Zero Trace edge:</span> {peer.zeroTraceEdge}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-400">
                      <span className="text-slate-200">Use split:</span> {peer.fit}
                    </p>
                  </article>
                ))}
              </div>

              <p className="mono text-[11px] uppercase tracking-[0.24em] text-slate-500">
                {benchmarkReviewDate}
              </p>
            </section>

            <section className="panel space-y-5">
              <div>
                <p className="mono text-xs uppercase tracking-[0.35em] text-emerald-300">
                  Ethical Usage
                </p>
                <h2 className="mt-3 text-2xl font-semibold text-slate-50">Passive data only</h2>
              </div>
              <p className="text-sm leading-6 text-slate-300">
                Zero Trace is built for authorized research, asset inventory, and defensive
                discovery. It uses public passive sources and does not perform active scanning.
              </p>
              <div className="panel-outline rounded-2xl px-4 py-4 text-sm text-slate-400">
                Public data still needs authorization. Validate scope before investigating targets.
              </div>
              {result ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <StatCard label="Response" value={`${result.metadata.durationMs} ms`} />
                  <StatCard label="Sources" value={result.sources.length} />
                </div>
              ) : null}
            </section>
          </div>
        </section>

        {error ? <div className="error-banner">{error}</div> : null}

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_420px]">
          <div className="space-y-6">
            <section className="panel space-y-5">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="mono text-xs uppercase tracking-[0.32em] text-amber-300">
                    Product Thesis
                  </p>
                  <h2 className="mt-3 text-2xl font-semibold text-slate-50">
                    The fastest path from target to passive asset map
                  </h2>
                </div>
                <span className="metric-pill">2026 bar</span>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                {zeroTraceAdvantages.map((advantage) => (
                  <article className="spotlight-card" key={advantage.title}>
                    <h3 className="text-base font-semibold text-slate-50">{advantage.title}</h3>
                    <p className="mt-3 text-sm leading-6 text-slate-400">{advantage.description}</p>
                  </article>
                ))}
              </div>
            </section>

            {result ? (
              <>
                <section className="panel space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="mono text-xs uppercase tracking-[0.32em] text-cyan-300">
                        Mission Control
                      </p>
                      <h2 className="mt-3 text-2xl font-semibold text-slate-50">
                        Query: {result.query.raw}
                      </h2>
                    </div>
                    <span className="metric-pill">
                      {result.metadata.cached ? "cache hit" : "live fetch"}
                    </span>
                  </div>

                  <div className="mission-strip grid gap-3 md:grid-cols-4">
                    <div className="mission-cell">
                      <div className="mono text-xs uppercase tracking-[0.3em] text-slate-500">Operator</div>
                      <p className="mt-2 text-sm text-slate-200">{result.query.operator}</p>
                    </div>
                    <div className="mission-cell">
                      <div className="mono text-xs uppercase tracking-[0.3em] text-slate-500">Source Graph</div>
                      <p className="mt-2 text-sm text-slate-200">{result.sources.join(" · ")}</p>
                    </div>
                    <div className="mission-cell">
                      <div className="mono text-xs uppercase tracking-[0.3em] text-slate-500">Disclaimer</div>
                      <p className="mt-2 text-sm text-slate-200">{result.metadata.disclaimer}</p>
                    </div>
                    <div className="mission-cell">
                      <div className="mono text-xs uppercase tracking-[0.3em] text-slate-500">Terms</div>
                      <p className="mt-2 text-sm text-slate-200">{result.query.terms.join(" · ")}</p>
                    </div>
                  </div>
                </section>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
                  <StatCard label="Domains" value={result.stats.domainCount} />
                  <StatCard label="Subdomains" value={result.stats.subdomainCount} />
                  <StatCard label="IPs" value={result.stats.ipCount} />
                  <StatCard label="People" value={result.stats.peopleCount} />
                  <StatCard label="Open Ports" value={result.stats.portCount} />
                  <StatCard label="Related Assets" value={result.stats.relatedAssetCount} />
                </div>

                {result.organization ? (
                  <ResultSection
                    count={result.organization.people.length}
                    eyebrow="Public organization intelligence"
                    title="Website OSINT"
                  >
                    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.9fr)]">
                      <article className="asset-card space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <h3 className="text-xl font-semibold text-slate-50">
                              {result.organization.name ?? result.organization.website}
                            </h3>
                            <p className="mt-2 text-sm text-slate-400">{result.organization.website}</p>
                          </div>
                          <span className="tag">Website profile</span>
                        </div>

                        {result.organization.summary ? (
                          <p className="text-sm leading-7 text-slate-300">{result.organization.summary}</p>
                        ) : null}

                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="mission-cell">
                            <div className="mono text-xs uppercase tracking-[0.3em] text-slate-500">
                              Founded year
                            </div>
                            <div className="mt-2 text-sm text-slate-200">
                              {result.organization.foundedYear ?? "Not confirmed"}
                            </div>
                          </div>
                          <div className="mission-cell">
                            <div className="mono text-xs uppercase tracking-[0.3em] text-slate-500">
                              Earliest archive year
                            </div>
                            <div className="mt-2 text-sm text-slate-200">
                              {result.organization.earliestArchiveYear ?? "Not detected"}
                            </div>
                          </div>
                          <div className="mission-cell">
                            <div className="mono text-xs uppercase tracking-[0.3em] text-slate-500">
                              Location
                            </div>
                            <div className="mt-2 text-sm text-slate-200">
                              {result.organization.location ?? "Not detected"}
                            </div>
                          </div>
                          <div className="mission-cell">
                            <div className="mono text-xs uppercase tracking-[0.3em] text-slate-500">
                              Generator
                            </div>
                            <div className="mt-2 break-all text-sm text-slate-200">
                              {result.organization.generator ?? "Not detected"}
                            </div>
                          </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-3">
                          <div>
                            <div className="mono text-xs uppercase tracking-[0.3em] text-slate-500">
                              Emails
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {result.organization.emails.length > 0 ? (
                                result.organization.emails.map((email) => (
                                  <span className="mini-chip" key={email}>
                                    {email}
                                  </span>
                                ))
                              ) : (
                                <span className="text-xs text-slate-500">None detected</span>
                              )}
                            </div>
                          </div>
                          <div>
                            <div className="mono text-xs uppercase tracking-[0.3em] text-slate-500">
                              Phones
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {result.organization.phones.length > 0 ? (
                                result.organization.phones.map((phone) => (
                                  <span className="mini-chip" key={phone}>
                                    {phone}
                                  </span>
                                ))
                              ) : (
                                <span className="text-xs text-slate-500">None detected</span>
                              )}
                            </div>
                          </div>
                          <div>
                            <div className="mono text-xs uppercase tracking-[0.3em] text-slate-500">
                              Source pages
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {result.organization.relevantPages.length > 0 ? (
                                result.organization.relevantPages.map((page) => (
                                  <ExternalLinkCard href={page.url} key={page.url} label={page.label} />
                                ))
                              ) : (
                                <span className="text-xs text-slate-500">No pages detected</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </article>

                      <article className="asset-card space-y-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <h3 className="text-lg font-semibold text-slate-50">Public team and leadership</h3>
                            <p className="mt-2 text-sm text-slate-400">
                              Best-effort extraction from the target website only. Not exhaustive.
                            </p>
                          </div>
                          <span className="metric-pill">{result.organization.people.length}</span>
                        </div>

                        <div className="space-y-3">
                          {result.organization.people.length > 0 ? (
                            result.organization.people.map((person) => (
                              <div className="history-item" key={`${person.name}-${person.role ?? ""}`}>
                                <div className="flex items-center justify-between gap-3">
                                  <div>
                                    <div className="mono text-sm text-slate-50">{person.name}</div>
                                    <div className="mt-2 text-xs text-slate-400">
                                      {person.role ?? "Public profile detected"}
                                    </div>
                                  </div>
                                  {person.sourcePage ? (
                                    <a
                                      className="tag"
                                      href={person.sourcePage}
                                      rel="noreferrer"
                                      target="_blank"
                                    >
                                      Source
                                    </a>
                                  ) : null}
                                </div>
                              </div>
                            ))
                          ) : (
                            <p className="text-sm text-slate-400">
                              No public employee or manager profiles were detected on the target site.
                            </p>
                          )}
                        </div>

                        <div>
                          <div className="mono text-xs uppercase tracking-[0.3em] text-slate-500">
                            Social links
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {result.organization.socialLinks.length > 0 ? (
                              result.organization.socialLinks.map((link) => (
                                <ExternalLinkCard
                                  href={link}
                                  key={link}
                                  label={new URL(link).hostname.replace(/^www\./, "")}
                                />
                              ))
                            ) : (
                              <span className="text-xs text-slate-500">No public social links detected</span>
                            )}
                          </div>
                        </div>
                      </article>
                    </div>
                  </ResultSection>
                ) : null}

                <ResultSection
                  count={result.domains.length + result.subdomains.length}
                  eyebrow={`Operator: ${result.query.operator}`}
                  title="Discovered Hosts"
                >
                  <div className="grid gap-3 md:grid-cols-2">
                    {[...result.domains, ...result.subdomains].map((asset) => (
                      <article className="asset-card" key={asset.hostname}>
                        <div className="flex items-center justify-between gap-3">
                          <span className="mono text-sm text-slate-50">{asset.hostname}</span>
                          <span className="tag">{asset.kind}</span>
                        </div>
                        <div className="mt-3 text-xs text-slate-400">
                          Sources: {asset.sources.join(", ")}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {asset.ipAddresses.length > 0 ? (
                            asset.ipAddresses.map((ip) => (
                              <span className="mini-chip" key={ip}>
                                {ip}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-slate-500">Awaiting IP enrichment</span>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                </ResultSection>

                <ResultSection count={result.ipAddresses.length} eyebrow="Passive enrichment" title="IP Intelligence">
                  <div className="space-y-3">
                    {result.ipAddresses.map((asset) => (
                      <article className="asset-card" key={asset.address}>
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="mono text-base text-slate-50">{asset.address}</span>
                          {asset.openPorts.map((port) => (
                            <span className="mini-chip" key={`${asset.address}-${port}`}>
                              {port}/tcp
                            </span>
                          ))}
                        </div>
                        <div className="mt-3 grid gap-3 text-sm text-slate-400 md:grid-cols-3">
                          <div>
                            <div className="mono text-xs uppercase tracking-[0.3em] text-slate-500">
                              Hostnames
                            </div>
                            <div className="mt-2 break-all">{asset.hostnames.join(", ") || "None"}</div>
                          </div>
                          <div>
                            <div className="mono text-xs uppercase tracking-[0.3em] text-slate-500">
                              Tags
                            </div>
                            <div className="mt-2 break-all">{asset.tags.join(", ") || "None"}</div>
                          </div>
                          <div>
                            <div className="mono text-xs uppercase tracking-[0.3em] text-slate-500">
                              CVEs
                            </div>
                            <div className="mt-2 break-all">{asset.vulns.join(", ") || "None"}</div>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </ResultSection>

                <ResultSection count={result.openPorts.length} eyebrow="Structured output" title="Open Ports">
                  <div className="flex flex-wrap gap-2">
                    {result.openPorts.length > 0 ? (
                      result.openPorts.map((entry) => (
                        <span className="mini-chip" key={`${entry.ip}-${entry.port}`}>
                          {entry.port}/tcp on {entry.ip}
                        </span>
                      ))
                    ) : (
                      <p className="text-sm text-slate-400">No passive open-port data returned for this search.</p>
                    )}
                  </div>
                </ResultSection>

                <ResultSection count={result.relatedAssets.length} eyebrow="Pivot material" title="Related Assets">
                  <div className="space-y-3">
                    {result.relatedAssets.length > 0 ? (
                      result.relatedAssets.map((asset) => (
                        <article className="asset-card" key={`${asset.kind}-${asset.value}-${asset.relation}`}>
                          <div className="flex items-center justify-between gap-3">
                            <span className="mono text-sm text-slate-50">{asset.value}</span>
                            <span className="tag">{asset.kind}</span>
                          </div>
                          <p className="mt-3 text-sm text-slate-400">{asset.relation}</p>
                          <div className="mt-3 mono text-xs text-slate-500">source: {asset.source}</div>
                        </article>
                      ))
                    ) : (
                      <p className="text-sm text-slate-400">No related assets discovered yet.</p>
                    )}
                  </div>
                </ResultSection>
              </>
            ) : (
              <>
                <section className="panel space-y-4">
                  <div className="badge">Ready</div>
                  <h2 className="text-3xl font-semibold text-slate-50">
                    Run your first passive recon query
                  </h2>
                  <p className="max-w-2xl text-sm leading-7 text-slate-400">
                    Start with a target domain or IP, then use the resulting hosts, IPs, and
                    related assets to pivot deeper. The UI is intentionally dense where it matters
                    and quiet everywhere else.
                  </p>
                </section>

                <section className="panel space-y-4">
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="mono text-xs uppercase tracking-[0.32em] text-cyan-300">
                        2026 Roadmap
                      </p>
                      <h2 className="mt-3 text-2xl font-semibold text-slate-50">
                        What moves this from MVP to category leader
                      </h2>
                    </div>
                    <span className="metric-pill">Next</span>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {roadmapSignals.map((item) => (
                      <article className="roadmap-item" key={item}>
                        <div className="status-dot mt-1" />
                        <p className="text-sm leading-6 text-slate-300">{item}</p>
                      </article>
                    ))}
                  </div>
                </section>
              </>
            )}
          </div>

          <div className="space-y-6">
            <HistoryPanel
              history={history}
              onReplay={(replayQuery) => {
                setQuery(replayQuery);
                void executeSearch(replayQuery);
              }}
            />

            <section className="panel space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-300">
                  Source Registry
                </h2>
                <span className="mono text-xs text-slate-500">
                  {result ? result.sources.length : 3} adapters
                </span>
              </div>
              <div className="space-y-3">
                {(result?.sources ?? ["certspotter", "google-dns", "internetdb"]).map((source) => (
                  <div className="history-item" key={source}>
                    <div className="mono text-sm text-slate-50">{source}</div>
                    <p className="mt-2 text-xs leading-6 text-slate-400">
                      Modular passive source adapter participating in the current search pipeline.
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <section className="panel space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-300">
                  Why It Feels Better
                </h2>
                <span className="mono text-xs text-slate-500">Product quality</span>
              </div>
              <div className="space-y-3">
                <div className="history-item">
                  <div className="mono text-sm text-slate-50">Less promptcraft</div>
                  <p className="mt-2 text-xs leading-6 text-slate-400">
                    Researchers should not negotiate with a chatbot just to enumerate passive exposure.
                  </p>
                </div>
                <div className="history-item">
                  <div className="mono text-sm text-slate-50">More provenance</div>
                  <p className="mt-2 text-xs leading-6 text-slate-400">
                    Results show where signal came from so verification and pivots stay immediate.
                  </p>
                </div>
                <div className="history-item">
                  <div className="mono text-sm text-slate-50">Narrower, stronger focus</div>
                  <p className="mt-2 text-xs leading-6 text-slate-400">
                    Zero Trace is not trying to replace general search, notebooks, or full threat intel suites.
                  </p>
                </div>
              </div>
            </section>

            {result?.notes.length ? (
              <section className="panel space-y-4">
                <h2 className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-300">
                  Notes
                </h2>
                <div className="space-y-3">
                  {result.notes.map((note) => (
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
