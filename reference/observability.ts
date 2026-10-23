/**
 * reference/observability.ts — Production Longitudinal Zero-Data-Loss Observability Engine
 *
 * Implements:
 * 1. Bounded body ingestion with prototype-pollution stripping and secret redaction.
 * 2. Write-time SHA-256 fingerprint deduplication so floods never exhaust storage or drop historical data.
 * 3. Append-only event store with monotonic sequence cursors.
 * 4. Permanent time-series rollups and percentile histograms (p50/p75/p95/p99) by (commit, route, metric).
 * 5. W3C Reporting API, legacy CSP reports, attribute-level CWV + LoAF attribution, /health, and trend analysis.
 */

export type Severity = "debug" | "info" | "warn" | "error";

export interface LogRecord {
  readonly seq: number;
  readonly id: string;
  readonly time: string;
  readonly severity: Severity;
  readonly type: string;
  readonly route: string | null;
  readonly message: string;
  readonly commit: string | null;
  readonly fingerprint: string;
  readonly occurrences: number;
  readonly firstSeenAt: string;
  readonly lastSeenAt: string;
  readonly context: Record<string, unknown>;
}

export interface MetricRollup {
  readonly commit: string;
  readonly route: string;
  readonly metric: string;
  readonly hourBucket: string;
  count: number;
  sum: number;
  min: number;
  max: number;
  values: number[]; // Used for computing exact percentiles
}

export interface PercentileResult {
  readonly count: number;
  readonly p50: number;
  readonly p75: number;
  readonly p95: number;
  readonly p99: number;
  readonly min: number;
  readonly max: number;
}

const SENSITIVE_KEY_REGEX = /^(?:.*_)?(?:token|secret|password|authorization|cookie|apikey|api_key|credential|session|bearer)(?:_.*)?$/i;
const CONTROL_CHAR_REGEX = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F\x1B]/g;

/** Clean and bound strings, stripping escape and control sequences */
export function cleanString(val: string, maxLen = 1024): string {
  return val.replace(CONTROL_CHAR_REGEX, "").trim().slice(0, maxLen);
}

/** Recursively redact credentials, auth tokens, and dangerous object keys */
export function redactSensitive(input: unknown, depth = 0): unknown {
  if (depth > 8) return "[truncated_depth]";
  if (typeof input !== "object" || input === null) {
    if (typeof input === "string") {
      let cleaned = cleanString(input);
      // Redact sensitive query parameters in URLs
      cleaned = cleaned.replace(/([?&](?:token|key|secret|auth|apikey)=)[^&]+/gi, "$1[redacted]");
      // Redact bearer tokens
      cleaned = cleaned.replace(/(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, "$1[redacted]");
      return cleaned;
    }
    return input;
  }

  if (Array.isArray(input)) {
    return input.slice(0, 50).map((item) => redactSensitive(item, depth + 1));
  }

  const record = input as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(record)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      continue;
    }
    const cleanKey = cleanString(key, 64);
    if (SENSITIVE_KEY_REGEX.test(cleanKey)) {
      sanitized[cleanKey] = "[redacted]";
    } else {
      sanitized[cleanKey] = redactSensitive(value, depth + 1);
    }
  }

  return sanitized;
}

/** Normalize volatile route parameters (UUIDs, numeric IDs) so fingerprints aggregate properly */
export function normalizeRoute(route: string | null): string {
  if (!route) return "unknown";
  return route
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ":id")
    .replace(/\/\d+(?=\/|$)/g, "/:id");
}

/** Compute deterministic SHA-256 fingerprint for write-time deduplication */
export async function computeEventFingerprint(params: {
  type: string;
  severity: Severity;
  route: string | null;
  keyDetail?: string;
}): Promise<string> {
  const normRoute = normalizeRoute(params.route);
  const raw = `${params.type}|${params.severity}|${normRoute}|${params.keyDetail ?? ""}`;
  const data = new TextEncoder().encode(raw);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

export function computePercentiles(values: number[]): PercentileResult {
  if (values.length === 0) {
    return { count: 0, p50: 0, p75: 0, p95: 0, p99: 0, min: 0, max: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const getP = (p: number) => {
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)));
    return sorted[idx]!;
  };

  return {
    count: sorted.length,
    p50: getP(50),
    p75: getP(75),
    p95: getP(95),
    p99: getP(99),
    min: sorted[0]!,
    max: sorted[sorted.length - 1]!,
  };
}

export interface LongitudinalStore {
  appendLog(entry: {
    severity: Severity;
    type: string;
    route?: string | null;
    message: string;
    commit?: string | null;
    keyDetail?: string;
    context?: Record<string, unknown>;
  }): Promise<LogRecord>;

  recordMetric(metric: {
    name: string;
    value: number;
    route: string;
    commit: string;
    hourBucket?: string;
  }): void;

  queryErrors(options: {
    since?: number;
    until?: number;
    limit?: number;
    severity?: Severity | "all";
  }): {
    cursor: string;
    events: LogRecord[];
    hasMore: boolean;
    scanned: number;
    returned: number;
    window: { oldestRetained: number; newest: number };
  };

  querySummary(options: {
    since?: number;
    severity?: Severity | "all";
  }): {
    cursor: string;
    totalMatches: number;
    scanned: number;
    bySeverity: Record<Severity, number>;
    byType: Record<string, number>;
    window: { oldestRetained: number; newest: number };
  };

  queryTrends(options: {
    metric: string;
    commit?: string;
    route?: string;
  }): PercentileResult;

  getHealth(commit?: string | null): Record<string, unknown>;
}

/**
 * Creates an append-only longitudinal event store with write-time deduplication and permanent rollups.
 */
export function createLongitudinalStore(): LongitudinalStore {
  const events: LogRecord[] = [];
  const rollups = new Map<string, MetricRollup>(); // key: `${commit}|${route}|${metric}|${hourBucket}`
  const activeFingerprints = new Map<string, { seq: number; lastSeen: number }>();
  let nextSeq = 1;

  const DEDUPE_WINDOW_MS = 60_000; // 1 minute deduplication window

  return {
    async appendLog(entry): Promise<LogRecord> {
      const now = new Date();
      const nowIso = now.toISOString();
      const nowMs = now.getTime();
      const severity = entry.severity;
      const type = cleanString(entry.type, 64);
      const route = entry.route ? cleanString(entry.route, 256) : null;
      const message = cleanString(entry.message, 512);
      const commit = entry.commit ?? null;
      const context = (redactSensitive(entry.context ?? {}) as Record<string, unknown>);

      const fingerprint = await computeEventFingerprint({
        type,
        severity,
        route,
        keyDetail: entry.keyDetail,
      });

      // Check write-time deduplication window
      const existing = activeFingerprints.get(fingerprint);
      if (existing && nowMs - existing.lastSeen < DEDUPE_WINDOW_MS) {
        existing.lastSeen = nowMs;
        const existingRecord = events.find((e) => e.seq === existing.seq);
        if (existingRecord) {
          (existingRecord as { occurrences: number }).occurrences++;
          (existingRecord as { lastSeenAt: string }).lastSeenAt = nowIso;
          return existingRecord;
        }
      }

      const seq = nextSeq++;
      const record: LogRecord = {
        seq,
        id: String(seq),
        time: nowIso,
        severity,
        type,
        route,
        message,
        commit,
        fingerprint,
        occurrences: 1,
        firstSeenAt: nowIso,
        lastSeenAt: nowIso,
        context,
      };

      events.push(record);
      activeFingerprints.set(fingerprint, { seq, lastSeen: nowMs });
      return record;
    },

    recordMetric(metric): void {
      const hourBucket = metric.hourBucket ?? new Date().toISOString().slice(0, 13) + ":00:00.000Z";
      const key = `${metric.commit}|${normalizeRoute(metric.route)}|${metric.name}|${hourBucket}`;
      let rollup = rollups.get(key);

      if (!rollup) {
        rollup = {
          commit: metric.commit,
          route: normalizeRoute(metric.route),
          metric: metric.name,
          hourBucket,
          count: 0,
          sum: 0,
          min: metric.value,
          max: metric.value,
          values: [],
        };
        rollups.set(key, rollup);
      }

      rollup.count++;
      rollup.sum += metric.value;
      rollup.min = Math.min(rollup.min, metric.value);
      rollup.max = Math.max(rollup.max, metric.value);
      rollup.values.push(metric.value);
    },

    queryErrors(options) {
      const since = options.since ?? 0;
      const limit = Math.min(options.limit ?? 100, 500);
      const severityFilter = options.severity ?? "warn";

      const oldestRetained = events.length > 0 ? events[0]!.seq : 1;
      const newest = events.length > 0 ? events[events.length - 1]!.seq : 0;

      if (since > 0 && since < oldestRetained - 1) {
        throw new Error(`410 cursor_too_old: oldest retained sequence is ${oldestRetained}`);
      }

      const severityMatches = (s: Severity): boolean => {
        if (severityFilter === "all") return true;
        if (severityFilter === "info") return s === "info" || s === "warn" || s === "error";
        if (severityFilter === "warn") return s === "warn" || s === "error";
        if (severityFilter === "error") return s === "error";
        return s === severityFilter;
      };

      const matched: LogRecord[] = [];
      let scanned = 0;
      let lastScannedSeq = since;

      for (const ev of events) {
        if (ev.seq <= since) continue;
        scanned++;
        lastScannedSeq = ev.seq;

        if (severityMatches(ev.severity)) {
          matched.push(ev);
          if (matched.length >= limit) break;
        }
      }

      const hasMore = events.some((e) => e.seq > lastScannedSeq);

      return {
        cursor: String(lastScannedSeq),
        events: matched,
        hasMore,
        scanned,
        returned: matched.length,
        window: { oldestRetained, newest },
      };
    },

    querySummary(options) {
      const since = options.since ?? 0;
      const severityFilter = options.severity ?? "warn";
      const oldestRetained = events.length > 0 ? events[0]!.seq : 1;
      const newest = events.length > 0 ? events[events.length - 1]!.seq : 0;

      const severityMatches = (s: Severity): boolean => {
        if (severityFilter === "all") return true;
        if (severityFilter === "info") return s === "info" || s === "warn" || s === "error";
        if (severityFilter === "warn") return s === "warn" || s === "error";
        if (severityFilter === "error") return s === "error";
        return s === severityFilter;
      };

      const bySeverity: Record<Severity, number> = { debug: 0, info: 0, warn: 0, error: 0 };
      const byType: Record<string, number> = {};
      let totalMatches = 0;
      let scanned = 0;
      let lastScannedSeq = since;

      for (const ev of events) {
        if (ev.seq <= since) continue;
        scanned++;
        lastScannedSeq = ev.seq;

        if (severityMatches(ev.severity)) {
          totalMatches += ev.occurrences;
          bySeverity[ev.severity] = (bySeverity[ev.severity] ?? 0) + ev.occurrences;
          byType[ev.type] = (byType[ev.type] ?? 0) + ev.occurrences;
        }
      }

      return {
        cursor: String(lastScannedSeq),
        totalMatches,
        scanned,
        bySeverity,
        byType,
        window: { oldestRetained, newest },
      };
    },

    queryTrends(options): PercentileResult {
      const matchingValues: number[] = [];
      for (const rollup of rollups.values()) {
        if (rollup.metric !== options.metric) continue;
        if (options.commit && rollup.commit !== options.commit) continue;
        if (options.route && rollup.route !== normalizeRoute(options.route)) continue;
        matchingValues.push(...rollup.values);
      }
      return computePercentiles(matchingValues);
    },

    getHealth(commit = "dev"): Record<string, unknown> {
      return {
        status: "ok",
        version: {
          commit: commit ?? "dev",
          commitSource: commit ? "env" : "unknown",
          commitKey: "CF_PAGES_COMMIT_SHA",
        },
        readiness: {
          ready: true,
          checks: [],
        },
        store: {
          totalEvents: events.length,
          totalRollups: rollups.size,
        },
      };
    },
  };
}

/** Web Vitals bands & metric rules */
export const CWV_BANDS: Record<string, { good: number; poor: number; unit: string }> = {
  lcp: { good: 2500, poor: 4000, unit: "ms" },
  inp: { good: 200, poor: 500, unit: "ms" },
  cls: { good: 0.1, poor: 0.25, unit: "" },
  loaf: { good: 50, poor: 150, unit: "ms" },
};

export async function parseAndRecordCwv(
  input: unknown,
  store: LongitudinalStore,
  commit = "dev"
): Promise<{ ok: boolean; reason?: string }> {
  if (typeof input !== "object" || input === null) {
    return { ok: false, reason: "payload must be an object" };
  }

  const data = input as Record<string, unknown>;
  const metric = typeof data.metric === "string" ? data.metric.toLowerCase() : "";
  const value = typeof data.value === "number" && Number.isFinite(data.value) ? data.value : -1;
  const page = typeof data.page === "string" ? data.page : "/";

  if (!CWV_BANDS[metric] || value < 0) {
    return { ok: false, reason: `invalid metric '${metric}' or negative value` };
  }

  const band = CWV_BANDS[metric]!;
  let severity: Severity = "info";
  if (value > band.poor) severity = "error";
  else if (value > band.good) severity = "warn";

  store.recordMetric({
    name: metric,
    value,
    route: page,
    commit,
  });

  await store.appendLog({
    severity,
    type: `cwv.${metric}`,
    route: page,
    commit,
    keyDetail: `${metric}:${page}`,
    message: `real-user ${metric.toUpperCase()} ${Math.round(value * 100) / 100}${band.unit} on ${page}`,
    context: {
      metric,
      value,
      elementSelector: data.elementSelector,
      loafAttribution: data.loafAttribution,
    },
  });

  return { ok: true };
}

/**
 * Handle incoming W3C Reporting API (application/reports+json) & legacy CSP (application/csp-report)
 */
export async function ingestBrowserReports(
  bodyText: string,
  contentType: string,
  store: LongitudinalStore,
  commit = "dev"
): Promise<{ accepted: number; rejected: number }> {
  if (!bodyText.trim()) return { accepted: 0, rejected: 0 };
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return { accepted: 0, rejected: 1 };
  }

  const reports: Array<Record<string, unknown>> = [];
  if (Array.isArray(parsed)) {
    for (const item of parsed.slice(0, 25)) {
      if (typeof item === "object" && item !== null) reports.push(item as Record<string, unknown>);
    }
  } else if (typeof parsed === "object" && parsed !== null) {
    const obj = parsed as Record<string, unknown>;
    if ("csp-report" in obj && typeof obj["csp-report"] === "object") {
      reports.push({
        type: "csp-violation",
        url: (obj["csp-report"] as Record<string, unknown>)["document-uri"],
        body: obj["csp-report"],
      });
    } else if (typeof obj.type === "string") {
      reports.push(obj);
    }
  }

  let accepted = 0;
  for (const report of reports) {
    const rawType = typeof report.type === "string" ? report.type : "other";
    const url = typeof report.url === "string" ? report.url : null;
    const body = (report.body as Record<string, unknown>) ?? {};

    let severity: Severity = "warn";
    if (rawType === "crash") severity = "error";
    else if (rawType === "deprecation") severity = "info";
    else if (rawType === "network-error") {
      const nelType = String(body["type"] ?? "");
      if (nelType === "abandoned" || nelType === "dns.address_changed") {
        severity = "info";
      }
    }

    await store.appendLog({
      severity,
      type: `report.${rawType}`,
      route: url,
      commit,
      keyDetail: rawType,
      message: `Browser report: ${rawType} on ${url ?? "unknown"}`,
      context: { rawType, url, body },
    });
    accepted++;
  }

  return { accepted, rejected: 0 };
}
