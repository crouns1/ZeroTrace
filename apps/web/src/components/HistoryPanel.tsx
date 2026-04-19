import type { HistoryEntry } from "../lib/types";

interface HistoryPanelProps {
  history: HistoryEntry[];
  onReplay: (query: string) => void;
}

const formatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

export function HistoryPanel({ history, onReplay }: HistoryPanelProps) {
  return (
    <section className="panel space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-300">
          Local History
        </h2>
        <span className="mono text-xs text-slate-500">{history.length} saved</span>
      </div>

      {history.length === 0 ? (
        <p className="text-sm text-slate-400">
          Recent searches stay in this browser so you can replay recon pivots quickly.
        </p>
      ) : (
        <div className="space-y-3">
          {history.map((entry) => (
            <button
              className="history-item w-full text-left"
              key={`${entry.query}-${entry.searchedAt}`}
              onClick={() => onReplay(entry.query)}
              type="button"
            >
              <div className="mono text-sm text-slate-100">{entry.query}</div>
              <div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-400">
                <span>{formatter.format(new Date(entry.searchedAt))}</span>
                <span>
                  {entry.stats.subdomainCount} subdomains / {entry.stats.ipCount} IPs
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

