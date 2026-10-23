# Observability System Specification

> Comprehensive, longitudinal browser and server telemetry built into the application on Day 1.

---

## 1. Endpoints & Headers

### 1.1 Ingestion: `POST /api/reports`
Accepts browser telemetry payloads in both W3C Reporting API and legacy CSP formats:
- `application/reports+json`: JSON array of `{ type, age, url, user_agent, body }` envelopes.
- `application/csp-report`: Legacy single-object `{ "csp-report": { ... } }` payload.

**Security Constraints**:
- Publicly accessible and unauthenticated (browsers send reports out-of-band).
- Body stream read is bounded at `64 KiB` (rejects with `413` without buffering oversized payloads).
- Prototype-pollution keys (`__proto__`, `constructor`, `prototype`) are stripped.
- Sensitive parameters (`token`, `secret`, `authorization`, `cookie`, `apiKey`) in URLs and report context are redacted to `[redacted]`.
- Rate-limited per client IP with write-time fingerprint deduplication (`SHA-256(type, severity, normalizedRoute, detail)`). Floods increment `occurrences` without evicting older historical events.

### 1.2 Telemetry Ingestion: `POST /api/observability/cwv`
Accepts attribute-level real-user Core Web Vitals and Long Animation Frames (LoAF) beacons sent via `navigator.sendBeacon`.
- Fields: `metric` (`lcp`, `inp`, `cls`, `loaf`), `value` (numeric), `page` (route string), `elementSelector` (for LCP/CLS/INP), `loafAttribution` (blocking duration, script URL, function name, character position).
- Mapped to severities based on standard Web Vitals bands:
  - LCP: `good <= 2500ms`, `warn <= 4000ms`, `error > 4000ms`
  - INP: `good <= 200ms`, `warn <= 500ms`, `error > 500ms`
  - CLS: `good <= 0.1`, `warn <= 0.25`, `error > 0.25`
  - LoAF: `info <= 50ms`, `warn <= 150ms`, `error > 150ms`

### 1.3 Query Endpoints (Host-Gate Exempt)
These two endpoints are exempt from the host gate so operators and agents can inspect logs even during a routing or host misconfiguration:
- `GET /api/observability/summary?since=<seq>&severity=warn|error|info|all`
- `GET /api/observability/errors?since=<seq>&limit=500&severity=warn|error|info|all`
- `GET /api/observability/trends?commits=10&metric=lcp|inp|cls|errors`: Returns longitudinal percentiles (`p50`, `p75`, `p95`, `p99`) across recent commits and time windows.

Authentication: `Authorization: Bearer <OBS_API_KEY>` (checked in constant time).

### 1.4 Unauthenticated Health Document: `GET /health` (and `/__health`)
```json
{
  "status": "ok",
  "version": {
    "commit": "9f1c2b...",
    "commitSource": "env",
    "commitKey": "CF_PAGES_COMMIT_SHA",
    "builtAt": "2026-10-23T18:00:00.000Z"
  },
  "readiness": {
    "ready": true,
    "checks": []
  },
  "reports": {
    "accepted": 12,
    "rejected": 0
  }
}
```

### 1.5 Header Declarations
- `Reporting-Endpoints`: `obs="https://<host>/api/reports"`
- `Report-To`: Legacy fallback group for engines requiring it.
- `NEL`: Network Error Logging header (emitted only on HTTPS origins).
- `Content-Security-Policy`: Carries `report-uri /api/reports` by default (avoiding the Chrome 155 dual directive local HTTP drop bug until verified on production HTTPS).
- `Server-Timing`: Emitted only when `OBS_SERVER_TIMING=1` or for authenticated admin sessions.

---

## 2. Cursor Semantics & Zero Data Loss

1. **Monotonic Sequence (`seq`)**: The event cursor is a sequence integer, not a clock timestamp, eliminating collision loss.
2. **Scan Advance**: The response cursor advances over everything the server *scanned*, not only what it returned.
3. **Permanent Rollups**: Rollups by `(commit, route, metric, hourBucket)` store `p50`, `p75`, `p95`, `p99` permanently in durable storage, ensuring historical trend visibility across all releases.
4. **Fingerprint Deduplication**: Floods of identical client-side errors collapse into counter increments (`occurrences`, `lastSeenAt`), preserving historical records without exhausting storage capacity.
