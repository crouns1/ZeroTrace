import { useEffect, useState } from "react";

interface SecurityPanelProps {
  apiKey: string;
  onSaveApiKey: (value: string) => void;
}

export function SecurityPanel({ apiKey, onSaveApiKey }: SecurityPanelProps) {
  const [draft, setDraft] = useState(apiKey);

  useEffect(() => {
    setDraft(apiKey);
  }, [apiKey]);

  return (
    <section className="panel space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="mono text-xs uppercase tracking-[0.32em] text-amber-300">Access Control</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-50">API key and exports</h2>
        </div>
        <span className="metric-pill">{apiKey ? "configured" : "optional"}</span>
      </div>

      <div className="space-y-3">
        <label className="block">
          <span className="mono text-xs uppercase tracking-[0.3em] text-slate-500">API key</span>
          <input
            autoComplete="off"
            className="mono mt-3 w-full rounded-2xl border border-slate-700/80 bg-slate-950/60 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-emerald-400/60"
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Paste ReconPulse API key"
            spellCheck={false}
            type="password"
            value={draft}
          />
        </label>

        <div className="flex flex-wrap gap-2">
          <button className="chip-button" onClick={() => onSaveApiKey(draft)} type="button">
            Save key
          </button>
          <button
            className="chip-button"
            onClick={() => {
              setDraft("");
              onSaveApiKey("");
            }}
            type="button"
          >
            Clear
          </button>
        </div>
      </div>

      <p className="text-sm leading-6 text-slate-400">
        The key is stored in this browser only and sent as `x-reconpulse-api-key` for secured API calls.
      </p>
    </section>
  );
}
