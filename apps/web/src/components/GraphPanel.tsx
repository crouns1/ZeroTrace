import type { ReconGraph } from "../lib/types";

const columns = ["domain", "subdomain", "ip", "tech", "endpoint", "person"] as const;

const nodeColors: Record<(typeof columns)[number], string> = {
  domain: "#34d399",
  subdomain: "#22d3ee",
  ip: "#f59e0b",
  tech: "#a78bfa",
  endpoint: "#f97316",
  person: "#f472b6",
};

export function GraphPanel({ graph }: { graph: ReconGraph }) {
  const grouped = columns.map((column) => ({
    column,
    nodes: graph.nodes.filter((node) => node.type === column).slice(0, 6),
  }));
  const positionedNodes = grouped.flatMap((group, groupIndex) =>
    group.nodes.map((node, nodeIndex) => ({
      ...node,
      x: 120 + groupIndex * 180,
      y: 80 + nodeIndex * 82,
      color: nodeColors[group.column],
    })),
  );
  const nodeMap = new Map(positionedNodes.map((node) => [node.id, node]));
  const width = 1200;
  const height = Math.max(420, positionedNodes.length * 50);

  return (
    <section className="panel space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="mono text-xs uppercase tracking-[0.32em] text-slate-500">Attack Surface Map</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-50">Domain ↔ IP ↔ tech ↔ people</h2>
        </div>
        <span className="metric-pill">{graph.nodes.length} nodes</span>
      </div>

      {graph.nodes.length === 0 ? (
        <p className="text-sm text-slate-400">Run a query to generate a relationship graph.</p>
      ) : (
        <div className="graph-shell overflow-x-auto rounded-3xl">
          <svg height={height} viewBox={`0 0 ${width} ${height}`} width="100%">
            {graph.edges.map((edge) => {
              const source = nodeMap.get(edge.source);
              const target = nodeMap.get(edge.target);

              if (!source || !target) {
                return null;
              }

              return (
                <g key={`${edge.source}-${edge.target}-${edge.label}`}>
                  <path
                    d={`M ${source.x} ${source.y} C ${source.x + 80} ${source.y}, ${target.x - 80} ${target.y}, ${target.x} ${target.y}`}
                    fill="none"
                    opacity="0.55"
                    stroke="rgba(125, 211, 252, 0.26)"
                    strokeWidth="1.5"
                  />
                  <text
                    fill="rgba(148, 163, 184, 0.68)"
                    fontFamily="IBM Plex Mono, monospace"
                    fontSize="10"
                    x={(source.x + target.x) / 2}
                    y={(source.y + target.y) / 2 - 4}
                  >
                    {edge.label}
                  </text>
                </g>
              );
            })}

            {positionedNodes.map((node) => (
              <g key={node.id}>
                <circle cx={node.x} cy={node.y} fill={node.color} opacity="0.92" r="22" />
                <circle cx={node.x} cy={node.y} fill="none" opacity="0.32" r="34" stroke={node.color} />
                <text
                  fill="#f8fafc"
                  fontFamily="IBM Plex Mono, monospace"
                  fontSize="12"
                  textAnchor="middle"
                  x={node.x}
                  y={node.y + 4}
                >
                  {node.type.slice(0, 3).toUpperCase()}
                </text>
                <text
                  fill="rgba(226, 232, 240, 0.95)"
                  fontFamily="IBM Plex Sans, sans-serif"
                  fontSize="12"
                  textAnchor="middle"
                  x={node.x}
                  y={node.y + 44}
                >
                  {node.label.length > 18 ? `${node.label.slice(0, 18)}…` : node.label}
                </text>
                {node.meta ? (
                  <text
                    fill="rgba(148, 163, 184, 0.9)"
                    fontFamily="IBM Plex Mono, monospace"
                    fontSize="10"
                    textAnchor="middle"
                    x={node.x}
                    y={node.y + 59}
                  >
                    {node.meta}
                  </text>
                ) : null}
              </g>
            ))}
          </svg>
        </div>
      )}
    </section>
  );
}

