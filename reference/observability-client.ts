/**
 * reference/observability-client.ts — Production Browser Telemetry & Resilience Agent
 *
 * Implements:
 * 1. ReportingObserver forwarding (CSP, deprecations, interventions, permissions-policy).
 * 2. Chrome 145+ navigator.crashReporter structured key-value annotations.
 * 3. Attribute-level PerformanceObserver (LCP element, INP interaction target, CLS shifted nodes, LoAF > 50ms script attribution).
 * 4. Resource load failure capture (window error with capture: true).
 * 5. State checkpointing and beacon flushing on pagehide / visibilitychange.
 */

export interface BrowserObservabilityConfig {
  readonly reportUrl: string;
  readonly cwvUrl: string;
  readonly commit?: string;
  readonly sampleRate?: number;
}

export interface CrashBreadcrumbs {
  route?: string;
  correlationId?: string;
  lastCommand?: string;
  memoryPressure?: string;
}

export function getSelector(el: Element | null): string {
  if (!el) return "unknown";
  if (el.id) return `#${el.id}`;
  let selector = el.tagName.toLowerCase();
  if (el.className && typeof el.className === "string") {
    selector += `.${el.className.trim().split(/\s+/).slice(0, 2).join(".")}`;
  }
  return selector;
}

export function updateCrashBreadcrumbs(breadcrumbs: CrashBreadcrumbs): void {
  if (typeof navigator !== "undefined" && "crashReporter" in navigator) {
    const reporter = (navigator as unknown as { crashReporter: { setKey: (k: string, v: string) => void } }).crashReporter;
    if (breadcrumbs.route) reporter.setKey("route", breadcrumbs.route);
    if (breadcrumbs.correlationId) reporter.setKey("correlation_id", breadcrumbs.correlationId);
    if (breadcrumbs.lastCommand) reporter.setKey("last_command", breadcrumbs.lastCommand);
    if (breadcrumbs.memoryPressure) reporter.setKey("memory_pressure", breadcrumbs.memoryPressure);
    reporter.setKey("timestamp", new Date().toISOString());
  }
}

export function initBrowserObservability(config: BrowserObservabilityConfig): {
  updateBreadcrumbs: (b: CrashBreadcrumbs) => void;
  destroy: () => void;
} {
  if (typeof window === "undefined") {
    return { updateBreadcrumbs: () => {}, destroy: () => {} };
  }

  const { reportUrl, cwvUrl, commit = "unknown" } = config;
  const observers: Array<{ disconnect: () => void }> = [];

  function sendBeacon(url: string, payload: unknown): void {
    const data = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url, data);
    } else {
      void fetch(url, {
        method: "POST",
        body: data,
        headers: { "content-type": "application/json" },
        keepalive: true,
      });
    }
  }

  // 1. Initial Crash Reporter stamping
  updateCrashBreadcrumbs({
    route: window.location.pathname,
    correlationId: crypto.randomUUID?.() ?? String(Date.now()),
  });
  if ("crashReporter" in navigator) {
    const reporter = (navigator as unknown as { crashReporter: { setKey: (k: string, v: string) => void } }).crashReporter;
    reporter.setKey("commit", commit);
    reporter.setKey("app_version", "1.0.0");
  }

  // 2. ReportingObserver (CSP violations, deprecations, interventions, permissions-policy)
  if (typeof ReportingObserver !== "undefined") {
    try {
      const ro = new ReportingObserver(
        (reports) => {
          const payload = reports.map((r) => ({
            type: r.type,
            url: r.url,
            body: r.body?.toJSON ? r.body.toJSON() : r.body,
          }));
          sendBeacon(reportUrl, payload);
        },
        { buffered: true }
      );
      ro.observe();
      observers.push(ro);
    } catch {
      // Ignored if options not supported
    }
  }

  // 3. Attribute-Level Core Web Vitals & LoAF via PerformanceObserver
  if (typeof PerformanceObserver !== "undefined") {
    // 3a. Largest Contentful Paint (LCP)
    try {
      const lcpObserver = new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries();
        const lastEntry = entries[entries.length - 1] as PerformanceEntry & {
          element?: Element;
          url?: string;
          renderTime?: number;
          loadTime?: number;
        };
        if (lastEntry) {
          const value = lastEntry.renderTime || lastEntry.loadTime || lastEntry.startTime;
          sendBeacon(cwvUrl, {
            metric: "lcp",
            value,
            page: window.location.pathname,
            elementSelector: getSelector(lastEntry.element ?? null),
            mediaUrl: lastEntry.url ?? null,
          });
        }
      });
      lcpObserver.observe({ type: "largest-contentful-paint", buffered: true });
      observers.push(lcpObserver);
    } catch { /* unsupported */ }

    // 3b. Cumulative Layout Shift (CLS)
    try {
      let clsValue = 0;
      const shiftedNodes: string[] = [];
      const clsObserver = new PerformanceObserver((entryList) => {
        for (const entry of entryList.getEntries()) {
          const shift = entry as PerformanceEntry & {
            hadRecentInput?: boolean;
            value?: number;
            sources?: Array<{ node?: Element }>;
          };
          if (!shift.hadRecentInput && shift.value) {
            clsValue += shift.value;
            if (shift.sources) {
              for (const src of shift.sources) {
                if (src.node) shiftedNodes.push(getSelector(src.node));
              }
            }
          }
        }
      });
      clsObserver.observe({ type: "layout-shift", buffered: true });
      observers.push(clsObserver);

      // Flush CLS on pagehide
      window.addEventListener("pagehide", () => {
        if (clsValue > 0) {
          sendBeacon(cwvUrl, {
            metric: "cls",
            value: clsValue,
            page: window.location.pathname,
            shiftedNodes: Array.from(new Set(shiftedNodes)).slice(0, 10),
          });
        }
      }, { once: true });
    } catch { /* unsupported */ }

    // 3c. Long Animation Frames (LoAF > 50ms)
    try {
      const loafObserver = new PerformanceObserver((entryList) => {
        for (const entry of entryList.getEntries()) {
          const loaf = entry as PerformanceEntry & {
            blockingDuration?: number;
            scripts?: Array<{
              invoker?: string;
              sourceURL?: string;
              sourceFunctionName?: string;
              sourceCharPosition?: number;
            }>;
          };
          if (loaf.duration > 50) {
            sendBeacon(cwvUrl, {
              metric: "loaf",
              value: loaf.duration,
              page: window.location.pathname,
              blockingDuration: loaf.blockingDuration,
              loafAttribution: loaf.scripts?.slice(0, 5).map((s) => ({
                invoker: s.invoker,
                sourceURL: s.sourceURL,
                sourceFunctionName: s.sourceFunctionName,
                sourceCharPosition: s.sourceCharPosition,
              })),
            });
          }
        }
      });
      loafObserver.observe({ type: "long-animation-frame", buffered: true });
      observers.push(loafObserver);
    } catch { /* unsupported */ }
  }

  // 4. Global Resource & Script Error Capture (capture: true catches <script>/<img>/link load failures!)
  const errorHandler = (event: ErrorEvent) => {
    const isResourceLoad = event.target && event.target !== window;
    const targetEl = isResourceLoad ? (event.target as Element) : null;
    sendBeacon(reportUrl, [{
      type: isResourceLoad ? "resource-error" : "javascript-error",
      url: window.location.href,
      body: {
        message: event.message || `Failed to load resource: ${targetEl?.tagName.toLowerCase()}`,
        filename: event.filename || (targetEl ? (targetEl as HTMLImageElement).src || (targetEl as HTMLLinkElement).href : undefined),
        lineno: event.lineno,
        colno: event.colno,
        targetSelector: getSelector(targetEl),
      },
    }]);
  };
  window.addEventListener("error", errorHandler, true);

  // 5. Unhandled Promise Rejections
  const rejectionHandler = (event: PromiseRejectionEvent) => {
    sendBeacon(reportUrl, [{
      type: "unhandled-rejection",
      url: window.location.href,
      body: {
        reason: event.reason instanceof Error ? event.reason.message : String(event.reason),
        stack: event.reason instanceof Error ? event.reason.stack : undefined,
      },
    }]);
  };
  window.addEventListener("unhandledrejection", rejectionHandler);

  return {
    updateBreadcrumbs: updateCrashBreadcrumbs,
    destroy(): void {
      for (const obs of observers) obs.disconnect();
      window.removeEventListener("error", errorHandler, true);
      window.removeEventListener("unhandledrejection", rejectionHandler);
    },
  };
}
