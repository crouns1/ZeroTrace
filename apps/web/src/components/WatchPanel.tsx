import type { WatchTarget } from "../lib/types";

interface WatchPanelProps {
  activeTargetId?: string | null;
  currentQuery: string;
  onDelete: (watchId: string) => void;
  onReplay: (query: string) => void;
  onRunCheck: (watchId: string) => void;
  onWatchCurrent: (query: string) => void;
  targets: WatchTarget[];
  watchingQuery: boolean;
}

const formatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function watchStatusClass(status: WatchTarget["status"]): string {
  if (status === "running") {
    return "status-running";
  }

  if (status === "completed") {
    return "status-completed";
  }

  if (status === "failed") {
    return "status-failed";
  }

  return "status-pending";
}

function severityClass(severity: WatchTarget["snapshots"][number]["changes"][number]["severity"]): string {
  if (severity === "critical") {
    return "status-critical";
  }

  if (severity === "high") {
    return "status-high";
  }

  if (severity === "medium") {
    return "status-medium";
  }

  if (severity === "low") {
    return "status-low";
  }

  return "status-pending";
}

export function WatchPanel({
  activeTargetId,
  currentQuery,
  onDelete,
  onReplay,
  onRunCheck,
  onWatchCurrent,
  targets,
  watchingQuery,
}: WatchPanelProps) {
  return (
    <section className="panel space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="mono text-xs uppercase tracking-[0.32em] text-emerald-300">Monitoring</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-50">Watch targets and diffs</h2>
        </div>
        <button
          className="chip-button"
          disabled={watchingQuery || !currentQuery.trim()}
          onClick={() => onWatchCurrent(currentQuery)}
          type="button"
        >
          {watchingQuery ? "Watching..." : "Watch current query"}
        </button>
      </div>

      {targets.length === 0 ? (
        <p className="text-sm text-slate-400">
          Save a query into monitoring to build a baseline and surface new subdomains, ports, tech, and high-risk targets over time.
        </p>
      ) : (
        <div className="space-y-4">
          {targets.map((target) => (
            <article className="asset-card space-y-4" key={target.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-slate-50">{target.label}</h3>
                    <span className={`status-tag ${watchStatusClass(target.status)}`}>{target.status}</span>
                  </div>
                  <p className="mono mt-2 text-xs text-slate-400">{target.query}</p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button className="chip-button" onClick={() => onReplay(target.query)} type="button">
                    Replay
                  </button>
                  <button
                    className="chip-button"
                    disabled={activeTargetId === target.id || target.status === "running"}
                    onClick={() => onRunCheck(target.id)}
                    type="button"
                  >
                    {activeTargetId === target.id || target.status === "running" ? "Checking..." : "Run check"}
                  </button>
                  <button className="chip-button" onClick={() => onDelete(target.id)} type="button">
                    Remove
                  </button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="mission-cell">
                  <div className="mono text-xs uppercase tracking-[0.3em] text-slate-500">Last checked</div>
                  <div className="mt-2 text-sm text-slate-200">
                    {target.lastCheckedAt ? formatter.format(new Date(target.lastCheckedAt)) : "Baseline pending"}
                  </div>
                </div>
                <div className="mission-cell">
                  <div className="mono text-xs uppercase tracking-[0.3em] text-slate-500">Next scheduled</div>
                  <div className="mt-2 text-sm text-slate-200">
                    {target.nextCheckAt ? formatter.format(new Date(target.nextCheckAt)) : "Manual only"}
                  </div>
                </div>
              </div>

              {target.latestSnapshot ? (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="mission-cell">
                    <div className="mono text-xs uppercase tracking-[0.3em] text-slate-500">Subdomains</div>
                    <div className="mt-2 text-sm text-slate-200">{target.latestSnapshot.stats.subdomainCount}</div>
                  </div>
                  <div className="mission-cell">
                    <div className="mono text-xs uppercase tracking-[0.3em] text-slate-500">IPs</div>
                    <div className="mt-2 text-sm text-slate-200">{target.latestSnapshot.stats.ipCount}</div>
                  </div>
                  <div className="mission-cell">
                    <div className="mono text-xs uppercase tracking-[0.3em] text-slate-500">Open ports</div>
                    <div className="mt-2 text-sm text-slate-200">{target.latestSnapshot.stats.portCount}</div>
                  </div>
                  <div className="mission-cell">
                    <div className="mono text-xs uppercase tracking-[0.3em] text-slate-500">High probability</div>
                    <div className="mt-2 text-sm text-slate-200">
                      {target.latestSnapshot.stats.highProbabilityCount}
                    </div>
                  </div>
                </div>
              ) : null}

              {target.lastError ? (
                <div className="rounded-2xl border border-rose-500/20 bg-rose-950/30 px-4 py-3 text-sm text-rose-200">
                  {target.lastError}
                </div>
              ) : null}

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="mono text-xs uppercase tracking-[0.3em] text-slate-500">Latest changes</div>
                  <span className="mono text-xs text-slate-500">
                    {target.latestSnapshot?.changeCount ?? 0} change{target.latestSnapshot?.changeCount === 1 ? "" : "s"}
                  </span>
                </div>

                {target.latestSnapshot?.changes.length ? (
                  <div className="space-y-3">
                    {target.latestSnapshot.changes.slice(0, 4).map((change) => (
                      <div className="history-item" key={`${target.id}-${change.id}-${change.observedAt}`}>
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="mono text-sm text-slate-50">{change.label}</div>
                          <span className={`status-tag ${severityClass(change.severity)}`}>{change.severity}</span>
                        </div>
                        <p className="mt-2 text-xs leading-6 text-slate-400">{change.detail}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">
                    {target.latestSnapshot
                      ? "Baseline established. ReconPulse will surface drift here as new data appears."
                      : "Run the first watch check to establish a baseline."}
                  </p>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
