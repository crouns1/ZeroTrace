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

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="metric-card">
      <div className="mono text-xs uppercase tracking-[0.3em] text-slate-500">{label}</div>
      <div className="mt-3 text-3xl font-semibold text-slate-50">{value}</div>
    </div>
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
            <div className="badge">Passive Recon MVP</div>
            <div className="mt-6 max-w-3xl">
              <h1 className="title-glow text-4xl font-semibold tracking-tight text-slate-50 sm:text-5xl">
                Zero Trace
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
                A specialized search engine for bug bounty hunters and security researchers. Query
                public recon sources, pivot through passive data, and keep your workflow fast.
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

            <div className="mt-5 flex flex-wrap gap-3">
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

          <div className="panel space-y-5">
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
          </div>
        </section>

        {error ? <div className="error-banner">{error}</div> : null}

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_420px]">
          <div className="space-y-6">
            {result ? (
              <>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                  <StatCard label="Domains" value={result.stats.domainCount} />
                  <StatCard label="Subdomains" value={result.stats.subdomainCount} />
                  <StatCard label="IPs" value={result.stats.ipCount} />
                  <StatCard label="Open Ports" value={result.stats.portCount} />
                  <StatCard label="Related Assets" value={result.stats.relatedAssetCount} />
                </div>

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
              <section className="panel space-y-4">
                <div className="badge">Ready</div>
                <h2 className="text-3xl font-semibold text-slate-50">Run your first passive recon query</h2>
                <p className="max-w-2xl text-sm leading-7 text-slate-400">
                  Start with a target domain or IP, then use the resulting hosts, IPs, and related
                  assets to pivot deeper. The dashboard is intentionally compact so you can scan
                  results quickly.
                </p>
              </section>
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
