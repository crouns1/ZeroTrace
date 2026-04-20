import type { SearchResponse } from "./types";

function downloadBlob(filename: string, contents: string, type: string): void {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function safeSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "reconpulse";
}

export function exportSearchAsJson(result: SearchResponse): void {
  const filename = `${safeSlug(result.query.value)}-reconpulse.json`;
  downloadBlob(filename, JSON.stringify(result, null, 2), "application/json");
}

export function exportSearchAsCsv(result: SearchResponse): void {
  const header = [
    "label",
    "asset_type",
    "risk_score",
    "risk_level",
    "status",
    "hostname",
    "ip_address",
    "open_ports",
    "technologies",
    "findings",
    "sources",
  ];
  const rows = result.insights.map((insight) => [
    insight.label,
    insight.assetType,
    String(insight.riskScore),
    insight.riskLevel,
    insight.status,
    insight.hostname ?? "",
    insight.ipAddress ?? "",
    insight.openPorts.join("|"),
    insight.techStack.map((technology) => technology.name).join("|"),
    insight.findings.map((finding) => `${finding.severity}:${finding.title}`).join("|"),
    insight.sources.join("|"),
  ]);
  const csv = [header, ...rows]
    .map((row) =>
      row
        .map((value) => `"${String(value).replaceAll('"', '""')}"`)
        .join(","),
    )
    .join("\n");
  const filename = `${safeSlug(result.query.value)}-reconpulse.csv`;
  downloadBlob(filename, csv, "text/csv;charset=utf-8");
}
