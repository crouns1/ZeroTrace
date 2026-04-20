# ReconPulse API

## Endpoints

### `GET /health`

Returns API health plus current cache and worker provider names.

### `GET /api/search`

Runs the passive recon pipeline synchronously and returns the fully ranked intelligence response.

Query parameter:

- `q`: required advanced query string

Example:

```text
/api/search?q=domain:mozilla.org%20sort:risk%20limit:5
```

### `POST /api/recon/jobs`

Creates an asynchronous recon job.

Request body:

```json
{
  "q": "domain:mozilla.org sort:risk limit:5"
}
```

Response:

- `202 Accepted`
- returns job metadata including `id`, `status`, and `progress`

### `GET /api/recon/jobs/:jobId`

Polls a running recon job and returns:

- job status
- progress percentage
- current stage
- final result when completed

## Query Language

Currently supported filters:

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

Examples:

- `domain:example.com port:443 risk:high`
- `domain:mozilla.org tech:wordpress sort:risk`
- `subdomain:docs.github.com status:investigate`
- `company:mozilla`
- `sundar pichai`

## Response Highlights

The main search response includes:

- raw asset collections:
  - domains
  - subdomains
  - IPs
  - `externalProfiles`
- derived intelligence:
  - `insights`
  - `highProbabilityTargets`
  - `suggestions`
- relationship view:
  - `graph.nodes`
  - `graph.edges`
- pipeline metadata:
  - `pipeline.stages`
- performance metadata:
  - cache provider
  - job provider
  - indexing provider

## Scaling Notes

- Without `REDIS_URL`, the API uses in-memory caching and an in-process worker queue.
- With `REDIS_URL`, the API can use Redis-backed caching and BullMQ-backed job execution.
- The current indexing provider is an in-memory placeholder with a Meilisearch-ready integration point documented in the architecture.
