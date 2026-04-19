import type { ReconInsight, RiskLevel } from "../lib/types";

const riskClasses: Record<RiskLevel, string> = {
  critical: "status-critical",
  high: "status-high",
  medium: "status-medium",
  low: "status-low",
};

export function InsightCard({ insight }: { insight: ReconInsight }) {
  return (
    <article className="insight-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mono text-sm text-slate-50">{insight.label}</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className={`status-tag ${riskClasses[insight.riskLevel]}`}>{insight.riskLevel}</span>
            <span className="tag">{insight.status}</span>
            <span className="metric-pill">score {insight.riskScore}</span>
          </div>
        </div>
        <div className="mono text-xs text-slate-500">{insight.assetType}</div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(260px,0.9fr)]">
        <div className="space-y-4">
          <div>
            <div className="mono text-xs uppercase tracking-[0.3em] text-slate-500">Findings</div>
            <div className="mt-3 space-y-2">
              {insight.findings.slice(0, 4).map((finding) => (
                <div className="finding-row" key={finding.id}>
                  <div className={`status-dot-mini tone-${finding.severity}`} />
                  <div>
                    <div className="text-sm text-slate-200">{finding.title}</div>
                    <div className="mt-1 text-xs leading-5 text-slate-400">{finding.description}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="mono text-xs uppercase tracking-[0.3em] text-slate-500">Where to look</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {insight.whereToLook.length > 0 ? (
                insight.whereToLook.map((item) => (
                  <span className="mini-chip" key={`${insight.id}-${item.title}`}>
                    {item.title}
                  </span>
                ))
              ) : (
                <span className="text-xs text-slate-500">No suggestions yet</span>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <div className="mono text-xs uppercase tracking-[0.3em] text-slate-500">Tech stack</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {insight.techStack.length > 0 ? (
                insight.techStack.map((technology) => (
                  <span className="mini-chip" key={`${insight.id}-${technology.name}-${technology.source}`}>
                    {technology.name}
                  </span>
                ))
              ) : (
                <span className="text-xs text-slate-500">No tech signal</span>
              )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="mission-cell">
              <div className="mono text-xs uppercase tracking-[0.3em] text-slate-500">Ports</div>
              <div className="mt-2 text-sm text-slate-200">
                {insight.openPorts.length > 0 ? insight.openPorts.join(", ") : "None"}
              </div>
            </div>
            <div className="mission-cell">
              <div className="mono text-xs uppercase tracking-[0.3em] text-slate-500">Linked IPs</div>
              <div className="mt-2 break-all text-sm text-slate-200">
                {insight.ipAddresses.length > 0 ? insight.ipAddresses.join(", ") : "None"}
              </div>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
