# ReconPulse

ReconPulse is a reconnaissance and bug bounty intelligence platform for security researchers who want signal, not noise. It turns passive public data into ranked targets, risk findings, tech fingerprints, graph relationships, and "where to look" suggestions that help users find bugs faster.

## Product Direction

ReconPulse is intentionally opinionated:

- Prioritize actionable intelligence over raw data dumps
- Rank assets by exploitability clues, not just discovery volume
- Stay passive and legal by default
- Make daily recon fast enough to live in a researcher’s browser all day

## What Ships Now

- Advanced query language with chained filters such as:
  - `domain:mozilla.org sort:risk limit:5`
  - `domain:example.com port:443 risk:medium`
  - `subdomain:docs.github.com status:investigate`
  - `domain:example.com tech:wordpress`
  - `company:mozilla`
  - plain-text public profile search such as `sundar pichai`
- Passive recon automation pipeline with:
  - Subdomain discovery
  - DNS/IP enrichment
  - Public web fingerprinting
  - Endpoint hints from `robots.txt`, `sitemap.xml`, and public pages
  - Risk scoring and prioritization
- Risk-ranked insights and high-probability targets
- Tech stack fingerprinting with historical CVE references where relevant
- Public website OSINT for company pages, public leadership/team listings, and archive-year hints
- External public-profile enrichment for companies and notable people
- Graph-based attack surface view
- Async recon jobs with polling
- Watch targets with baseline snapshots and change diffs
- Optional webhook notifications for watch changes
- Browser-local search history
- Modular source adapters
- Memory-first runtime with optional Redis + BullMQ scale path
- Security hardening with API keys, rate limiting, audit logs, and safer outbound fetch rules

## Stack

- Frontend: React + Tailwind + Vite
- Backend: Express + TypeScript
- Optional scale path: Redis + BullMQ

## Architecture

The codebase is split into two workspaces:

- `apps/api`: query parser, source adapters, passive recon pipeline, intelligence scoring, graph generation, async jobs, and cache abstraction
- `apps/web`: hacker-centric workbench UI with advanced query entry, ranking panels, graph view, and live pipeline progress

More detail is available in [docs/architecture.md](/home/crouns/Desktop/futur_projects/ZeroTrace/docs/architecture.md) and [docs/api.md](/home/crouns/Desktop/futur_projects/ZeroTrace/docs/api.md).

## Data Sources Used

- Cert Spotter CT Search API for certificate transparency lookups
- Google Public DNS JSON API for passive DNS resolution
- Shodan InternetDB for passive IP/service enrichment
- Wikidata search/entity APIs for public company and notable-person profile enrichment
- GitHub public organization APIs for public org member and repository signals
- Target website public pages for:
  - company/team/contact signals
  - tech fingerprint clues
  - public endpoint hints
- Internet Archive CDX API as a best-effort source for earliest public archive year

All current sources are passive/public. ReconPulse does not perform active scanning or intrusive probing.

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Start the API and frontend

```bash
npm run dev
```

Default local ports:

- Frontend: `http://localhost:5173`
- API: `http://localhost:4010`

### 3. Build for production

```bash
npm run build
```

### 4. Run the test suite

```bash
npm test
```

## Optional Scaling Setup

If you want shared caching and a real worker queue, provide Redis:

```bash
export REDIS_URL=redis://localhost:6379
npm run dev
```

Without `REDIS_URL`, ReconPulse uses in-memory cache and an in-process worker queue.

Optional monitoring controls:

```bash
export WATCH_INTERVAL_MS=900000
export WATCH_MAX_SNAPSHOTS=8
npm run dev
```

`WATCH_INTERVAL_MS` sets the automatic watch recheck interval. Set it to `0` for manual-only monitoring.

## Security Controls

Set a production API key and operational limits:

```bash
cp .env.example .env
```

Important variables:

- `RECONPULSE_API_KEYS`: comma-separated API keys accepted by the API
- `CORS_ORIGIN`: comma-separated allowed browser origins
- `RATE_LIMIT_WINDOW_MS`: shared throttling window
- `RATE_LIMIT_SEARCH_MAX`: max search/read requests per window per client
- `RATE_LIMIT_MUTATION_MAX`: max job/watch mutations per window per client
- `AUDIT_LOG_PATH`: JSONL audit log output path
- `WATCH_STORAGE_PATH`: persisted watch state path
- `WATCH_NOTIFICATION_WEBHOOK_URLS`: optional comma-separated webhook endpoints for watch-change notifications

When API keys are enabled, the browser UI can store one locally in the Access Control panel and send it as `x-reconpulse-api-key`.

## API Highlights

- `GET /api/search?q=domain:mozilla.org sort:risk`
- `POST /api/recon/jobs` with JSON body `{ "q": "domain:mozilla.org sort:risk" }`
- `GET /api/recon/jobs/:jobId`
- `GET /api/watch-targets`
- `POST /api/watch-targets`
- `POST /api/watch-targets/:watchId/check`
- `DELETE /api/watch-targets/:watchId`
- `GET /health`

See [docs/api.md](/home/crouns/Desktop/futur_projects/ZeroTrace/docs/api.md) for more detail.

## Notes

- Search history is stored in browser `localStorage`.
- Watch targets now persist to disk via `WATCH_STORAGE_PATH`.
- Audit logs are written as JSON lines to `AUDIT_LOG_PATH`.
- The API enforces optional API-key auth, per-client rate limits, and restrictive outbound fetch validation for public-only destinations.
- Search results can now be exported from the UI as JSON or CSV.
- Website organization intelligence is best-effort and limited to public target-site content.
- External people/company enrichment is limited to public knowledge-graph and public organization-profile data.
- ReconPulse does not scrape third-party employee networks or build private-person lookup workflows.
- GitHub public organization members are shown as public profiles and should not be assumed to be a complete employee list.
- Historical CVE references in the UI are meant to guide validation, not assert that a target is definitely vulnerable.
- The indexing layer is intentionally documented as “Meilisearch-ready” while the current implementation uses an in-memory searchable model.

## Ethics

ReconPulse is intended for defensive research, asset inventory, and authorized security work. Only use it against assets you are legally allowed to investigate. Public data does not remove the need for authorization.
