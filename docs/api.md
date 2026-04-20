# ReconPulse API

## Endpoints

### `GET /health`

Returns API health plus current cache, worker, and monitoring summary.

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

### `GET /api/watch-targets`

Lists the current watch targets, including:

- current watch status
- latest snapshot stats
- most recent change list
- next scheduled check time

### `POST /api/watch-targets`

Creates a watch target and immediately establishes a baseline snapshot.

Request body:

```json
{
  "q": "domain:mozilla.org sort:risk",
  "label": "Mozilla Surface"
}
```

### `POST /api/watch-targets/:watchId/check`

Runs a fresh monitoring check and returns the updated watch target with any newly detected changes.

### `DELETE /api/watch-targets/:watchId`

Removes a watch target from monitoring.

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
- monitoring:
  - `watchTargets[].latestSnapshot`
  - `watchTargets[].snapshots`
  - `watchTargets[].latestSnapshot.changes`
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
- Watch monitoring state is currently in-memory; targets reset when the API process restarts.
- `WATCH_INTERVAL_MS` controls automatic monitoring frequency. Set `0` for manual-only checks.
