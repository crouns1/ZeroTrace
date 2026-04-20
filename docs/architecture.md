# ReconPulse Architecture

## Objectives

- Help bug bounty hunters find likely bugs faster
- Reduce noise and increase signal with risk-ranked output
- Keep all collection passive, public, and legally safe by default
- Stay modular so new data sources and heuristics can be added without rewriting the product
- Keep the runtime usable locally while preserving a clear path to Redis/BullMQ scale-out

## High-Level Design

```text
React Workbench
  -> Search / Job API
    -> Advanced Query Parser
    -> Source Registry
      -> certificate transparency
      -> passive DNS
      -> passive service enrichment
      -> website intelligence
      -> external public profiles
    -> Enrichment Worker
    -> Intelligence Engine
      -> risk scoring
      -> tech fingerprinting
      -> subdomain intelligence
      -> where-to-look suggestions
      -> graph builder
    -> Cache Provider
      -> memory
      -> redis (optional)
    -> Job Runner
      -> memory worker
      -> BullMQ (optional)
    -> Watch Service
      -> baseline snapshots
      -> change diffs
      -> scheduled rechecks
```

## Backend Modules

### Advanced Query Parser

Normalizes command-style queries into a structured filter set.

Supported filters today:

- `domain:`
- `subdomain:`
- `ip:`
- `company:`
- `person:`
- `port:`
- `risk:`
- `status:`
- `tech:`
- `sort:`
- `limit:`

### Source Registry

Each source adapter follows the same interface:

- `supports(query)`
- `search(query)`

Current adapters:

- certificate transparency
- passive DNS
- passive IP/service enrichment
- website profile and public organization intelligence
- external public-profile enrichment from knowledge graph and public org APIs

This makes it straightforward to add future providers such as:

- Censys
- SecurityTrails
- VirusTotal
- Whois / RDAP
- ASN enrichment
- bug bounty program metadata

### Enrichment Worker

The enrichment worker handles safe follow-up collection after the initial source pass.

Current responsibilities:

- resolve discovered hostnames to IPs
- enrich IPs with passive port/service signals
- extend passive website context

### Watch Service

The monitoring layer turns one-off recon into an ongoing workflow.

Current responsibilities:

- store watched queries in memory
- create a baseline snapshot from the latest search response
- compare each new run against the latest snapshot
- surface changes such as:
  - new subdomains
  - new IPs
  - new open ports
  - new technologies
  - new public people signals
  - new endpoints
  - new high-probability targets
- schedule automatic rechecks when `WATCH_INTERVAL_MS` is enabled

### Intelligence Engine

The intelligence layer is the core product differentiator.

Current responsibilities:

- risk scoring
- severity/risk labeling
- historical CVE reference mapping
- subdomain takeover heuristics
- endpoint-interest detection
- missing security-header findings
- "where to look" suggestions
- graph generation

### Cache Provider

ReconPulse uses a provider abstraction instead of hardcoding caching logic.

Implemented providers:

- in-memory TTL cache
- Redis cache when `REDIS_URL` is configured

### Job Runner

Recon jobs can run either:

- synchronously through `GET /api/search`
- asynchronously through `POST /api/recon/jobs`

Implemented runners:

- in-process memory worker
- BullMQ worker when `REDIS_URL` is configured

## Frontend Workbench

The frontend is designed around a researcher’s daily loop:

- enter advanced query
- review high-probability targets first
- inspect findings and where-to-look suggestions
- pivot through the graph
- replay searches from local history
- run the async pipeline when a longer collection is useful

Primary surfaces:

- command bar
- ranked target cards
- watch monitoring panel
- website fingerprint panel
- external OSINT profile panel
- graph view
- pipeline progress panel
- local history

## Scaling Direction

Near-term scale path:

- Redis shared cache
- BullMQ workers
- Meilisearch or Elasticsearch index provider
- background monitoring jobs
- collaborative workspaces and export/reporting API

## Security and Ethics

- passive, public data sources only
- no active scanning or intrusive probing in the current product
- clear disclaimer in API and UI
- public people data is limited to what the target website itself exposes and may be incomplete
- external person/company enrichment is limited to public knowledge-graph and public org-profile sources
- public GitHub org members are treated as public profiles, not guaranteed employees
- watch monitoring stores state in API memory in the current build
- CVE references are treated as validation leads, not proof of exploitability
