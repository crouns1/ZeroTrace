# Zero Trace Architecture

## Objectives

- Keep the UX fast and minimal for security researchers
- Use passive, public, legally accessible data sources only
- Make data-source integrations easy to add or replace
- Keep the MVP simple while leaving room for accounts, exports, and background jobs

## High-Level Design

```text
React UI
  -> Search API
    -> Query Parser
    -> Source Registry
      -> certificate transparency source
      -> Google DNS source
      -> InternetDB source
    -> Enrichment Worker
    -> Aggregator / Normalizer
    -> TTL Cache
```

## Backend Modules

### Query Parser

Normalizes raw user input into a structured search intent.

- `domain:example.com`
- `subdomain:api.example.com`
- `ip:8.8.8.8`
- plain domain fallback such as `example.com`

## Source Adapters

Each adapter exposes the same interface:

- `supports(query)`
- `search(query)`

This keeps source logic isolated from the API route and makes future integrations straightforward, such as:

- Censys
- SecurityTrails
- VirusTotal
- Whois / RDAP
- ASN enrichment

## Enrichment Worker

The MVP uses a lightweight promise-based worker layer to enrich results without adding queue infrastructure yet.

Current responsibilities:

- Resolve discovered domains and subdomains to IPs
- Enrich IPs with passive port and hostname data
- Deduplicate and normalize records

Future upgrade path:

- BullMQ or a similar queue backed by Redis
- Scheduled refresh jobs
- User-triggered background collections

## Caching Strategy

An in-memory TTL cache reduces repeat calls and keeps the experience fast during iterative recon. Redis is the natural next step for shared caching and rate-limit protection once the project grows beyond a single process.

## Frontend Design

The interface is optimized for quick scanning:

- Command-style search bar
- Operator hints
- Dense but readable result cards
- Persistent local history for repeated target pivots
- Dark theme with terminal-inspired accents

## Data Model Direction

The current MVP returns normalized JSON to the frontend and stores history locally in the browser. A production-ready version can add PostgreSQL with tables such as:

- `users`
- `saved_searches`
- `saved_exports`
- `search_jobs`
- `source_observations`

## Security and Ethics

- Passive, public data sources only
- Clear disclaimer in the UI and API responses
- No active scanning or intrusion logic
- Designed for authorized security research and asset discovery
