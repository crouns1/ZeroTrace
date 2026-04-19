import { FormEvent } from "react";

interface SearchBarProps {
  isLoading: boolean;
  onQueryChange: (value: string) => void;
  onSearch: (query: string) => void;
  query: string;
}

export function SearchBar({ isLoading, onQueryChange, onSearch, query }: SearchBarProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSearch(query);
  }

  return (
    <form className="space-y-3" onSubmit={handleSubmit}>
      <div className="panel-outline flex items-center gap-3 rounded-2xl px-4 py-3">
        <span className="mono text-sm text-emerald-300">query&gt;</span>
        <input
          autoComplete="off"
          className="mono w-full bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-500"
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="domain:example.com"
          spellCheck={false}
          type="text"
          value={query}
        />
        <button className="action-button" disabled={isLoading} type="submit">
          {isLoading ? "Searching..." : "Search"}
        </button>
      </div>
      <p className="mono text-xs text-slate-400">
        Operators: <span className="text-emerald-300">domain:</span>,{" "}
        <span className="text-cyan-300">subdomain:</span>, <span className="text-amber-300">ip:</span>
      </p>
    </form>
  );
}

