# Zero Trace

Zero Trace is a fast, hacker-friendly reconnaissance search engine for bug bounty hunters and security researchers. It aggregates passive OSINT data from public sources, normalizes results, and presents them in a dark dashboard built for fast triage and faster pivots.

## Product Direction

Zero Trace is intentionally narrow:

- Not a general AI search assistant
- Not a notebook workspace
- Not a full enterprise threat intelligence suite

It is the fastest path from target to passive asset map for authorized external recon.

## MVP Features

- Advanced search operators: `domain:`, `subdomain:`, `ip:`
- Passive aggregation from public certificate transparency, DNS, and IP enrichment sources
- Structured results for domains, subdomains, IPs, open ports, and related assets
- Browser-local search history
- Modular backend source system for future expansion
- Ethical-usage disclaimer in both the API response and frontend UI

## Architecture

The codebase is split into two workspaces:

- `apps/api`: Express API with a query parser, source adapters, in-memory caching, and a lightweight enrichment worker
- `apps/web`: React + Tailwind dashboard with a terminal-inspired search UX and local history persistence

More detail is available in [docs/architecture.md](/home/crouns/Desktop/futur_projects/ZeroTrace/docs/architecture.md).
Competitive positioning is documented in [docs/competitive-analysis.md](/home/crouns/Desktop/futur_projects/ZeroTrace/docs/competitive-analysis.md).

## Data Sources Used

- Cert Spotter CT Search API for certificate transparency lookups
- Google Public DNS JSON API for passive DNS resolution
- Shodan InternetDB for passive IP enrichment on `ip:` searches and resolved IPs

All sources used in this MVP are public/passive. Zero Trace does not perform active scanning.

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Start the API and frontend

```bash
npm run dev
```

The apps run on:

- Frontend: `http://localhost:5173`
- API: `http://localhost:4010`

### 3. Build for production

```bash
npm run build
```

## Example Queries

- `domain:example.com`
- `subdomain:api.example.com`
- `ip:8.8.8.8`
- `example.com`

## MVP Notes

- Search history is intentionally stored in browser `localStorage` for zero-config local persistence.
- The backend includes an in-memory TTL cache to reduce repeat calls to public sources.
- The worker system is lightweight and promise-based for this MVP, making it easy to replace with a queue later.
- PostgreSQL and Redis are documented as future-ready slots in the architecture, but are not required to run this initial version.

## 2026 Quality Bar

- Command-first UX instead of prompt-heavy UX
- Structured recon output instead of generic summaries
- Visible source provenance and repeatable pivots
- Narrow scope with stronger defaults

Zero Trace is benchmarked against relevant Google peers in the competitive analysis doc:

- Google Search AI Mode
- NotebookLM
- Google Threat Intelligence / VirusTotal

## Ethical Usage

Zero Trace is intended for defensive research, asset inventory, and authorized security work. Only use it against targets you are legally allowed to investigate. Public data does not remove the need for authorization.
