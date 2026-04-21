import { FormEvent } from "react";

const operatorHints = [
  { key: "domain:", note: "surface scope" },
  { key: "subdomain:", note: "asset pivot" },
  { key: "company:", note: "org OSINT" },
  { key: "person:", note: "public profile" },
  { key: "risk:", note: "priority filter" },
  { key: "tech:", note: "stack focus" },
];

interface SearchBarProps {
  isLoading: boolean;
  isPipelineLoading: boolean;
  onLaunchPipeline: (query: string) => void;
  onQueryChange: (value: string) => void;
  onSearch: (query: string) => void;
  query: string;
}

export function SearchBar({
  isLoading,
  isPipelineLoading,
  onLaunchPipeline,
  onQueryChange,
  onSearch,
  query,
}: SearchBarProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSearch(query);
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="search-shell">
        <div className="search-row">
          <div className="search-prompt">
            <div className="mono text-[11px] uppercase tracking-[0.28em] text-slate-500">command</div>
            <div className="mono mt-2 text-sm text-emerald-300">recon@pulse:~$</div>
          </div>

          <input
            autoComplete="off"
            className="search-input mono"
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="domain:example.com sort:risk"
            spellCheck={false}
            type="text"
            value={query}
          />
        </div>

        <div className="search-control-row">
          <p className="text-sm leading-6 text-slate-400">
            Chain filters, sort the surface, then launch deeper passive correlation when the target looks worth your time.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <button className="action-button" disabled={isLoading} type="submit">
              {isLoading ? "Searching..." : "Search"}
            </button>
            <button
              className="chip-button"
              disabled={isPipelineLoading}
              onClick={() => onLaunchPipeline(query)}
              type="button"
            >
              {isPipelineLoading ? "Pipeline..." : "Run Pipeline"}
            </button>
          </div>
        </div>
      </div>

      <div className="operator-legend">
        {operatorHints.map((operator) => (
          <div className="legend-chip" key={operator.key}>
            <span className="legend-key">{operator.key}</span>
            <span className="legend-note">{operator.note}</span>
          </div>
        ))}
      </div>

      <p className="mono text-xs text-slate-400">
        Also supports <span className="text-amber-300">ip:</span>, <span className="text-violet-300">port:</span>,{" "}
        <span className="text-sky-300">tech:</span>, <span className="text-lime-300">status:</span>, and plain text for
        multi-word names.
      </p>
    </form>
  );
}
