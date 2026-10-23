/**
 * reference/capability-composer.ts — Production Route-Scoped Security Capability Composer
 *
 * Implements two-tier capability security:
 * Tier 1: Route-scoped Content-Security-Policy & Permissions-Policy headers.
 * Tier 2: Isolated sandboxed iframe attributes with schema-validated bridges.
 */

export interface WebAppManifestShortcut {
  readonly name: string;
  readonly url: string;
  readonly short_name?: string;
  readonly description?: string;
  readonly icons?: readonly { src: string; sizes: string; type?: string }[];
}

export interface WebAppManifestShareTarget {
  readonly action: string;
  readonly method?: "GET" | "POST";
  readonly enctype?: string;
  readonly params: {
    readonly title?: string;
    readonly text?: string;
    readonly url?: string;
    readonly files?: readonly { name: string; accept: readonly string[] }[];
  };
}

export interface WebAppManifestFileHandler {
  readonly action: string;
  readonly accept: Record<string, readonly string[]>;
  readonly icons?: readonly { src: string; sizes: string; type?: string }[];
  readonly launch_type?: "single-client" | "multiple-clients";
}

export interface WebAppManifestProtocolHandler {
  readonly protocol: string;
  readonly url: string;
}

export interface WebAppManifestContribution {
  readonly shortcuts?: readonly WebAppManifestShortcut[];
  readonly share_target?: WebAppManifestShareTarget;
  readonly file_handlers?: readonly WebAppManifestFileHandler[];
  readonly protocol_handlers?: readonly WebAppManifestProtocolHandler[];
}

export interface WellKnownContribution {
  readonly changePasswordUrl?: string; // Redirects /.well-known/change-password
  readonly webauthnOrigins?: readonly string[]; // /.well-known/webauthn origins
  readonly assetLinks?: readonly Record<string, unknown>[]; // /.well-known/assetlinks.json
  readonly appleAppSiteAssociation?: Record<string, unknown>; // /.well-known/apple-app-site-association
}

export interface FeatureCapabilityManifest {
  readonly id: string;
  readonly routes: readonly string[]; // URLPattern string patterns (e.g. "/record", "/studio/*")
  readonly permissionsPolicy?: Record<string, readonly string[]>; // e.g. { microphone: ["self"] }
  readonly cspDirectives?: Record<string, readonly string[]>; // e.g. { "media-src": ["'self'", "blob:"] }
  readonly llmMode?: "server-proxy" | "client-byok";
  readonly manifest?: WebAppManifestContribution;
  readonly wellKnown?: WellKnownContribution;
  readonly adr?: string;
  readonly justification?: string;
}

export const KNOWN_LLM_HOSTS = [
  "generativelanguage.googleapis.com",
  "api.openai.com",
  "api.anthropic.com",
  "api.groq.com",
  "api.mistral.ai",
  "api.together.xyz",
  "api.cohere.com",
] as const;

/** Complete default-deny permissions policy list (every powerful browser API disabled by default) */
export const DEFAULT_PERMISSIONS_POLICY: Readonly<Record<string, readonly string[]>> = {
  "accelerometer": [],
  "ambient-light-sensor": [],
  "autoplay": [],
  "battery": [],
  "bluetooth": [],
  "browsing-topics": [],
  "camera": [],
  "ch-ua-high-entropy-values": [],
  "clipboard-read": [],
  "clipboard-write": ["self"],
  "compute-pressure": [],
  "cross-origin-isolated": [],
  "display-capture": [],
  "encrypted-media": [],
  "execution-while-not-rendered": [],
  "execution-while-out-of-viewport": [],
  "fullscreen": ["self"],
  "gamepad": [],
  "geolocation": [],
  "gyroscope": [],
  "hid": [],
  "identity-credentials-get": [],
  "idle-detection": [],
  "interest-cohort": [],
  "join-ad-interest-group": [],
  "keyboard-map": [],
  "local-fonts": [],
  "magnetometer": [],
  "microphone": [],
  "midi": [],
  "navigation-override": [],
  "otp-credentials": [],
  "payment": [],
  "picture-in-picture": [],
  "publickey-credentials-create": [],
  "publickey-credentials-get": [],
  "run-ad-auction": [],
  "screen-wake-lock": [],
  "serial": [],
  "shared-autofill": [],
  "smart-card": [],
  "speaker-selection": [],
  "storage-access": [],
  "sync-xhr": [],
  "unload": [],
  "usb": [],
  "vertical-scroll": [],
  "web-share": [],
  "window-management": [],
  "xr-spatial-tracking": [],
};

/** Generate a cryptographically random, base64-encoded 128-bit nonce */
export function newCspNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary).replace(/=+$/u, "");
}

/** Check if a route matches a URLPattern or glob pattern */
export function matchesRoute(pattern: string, pathname: string): boolean {
  if (pattern === "/*" || pattern === "*") return true;
  if (pattern.endsWith("/*")) {
    const prefix = pattern.slice(0, -2);
    return pathname === prefix || pathname.startsWith(prefix + "/");
  }
  return pattern === pathname;
}

export interface ComposeHeadersOptions {
  readonly pathname: string;
  readonly nonce: string;
  readonly slices?: readonly FeatureCapabilityManifest[];
  readonly reportSinkUrl?: string;
  readonly deliveryMode?: "report-uri" | "reporting-api" | "both";
  readonly enableNel?: boolean;
  readonly serverTiming?: readonly { name: string; dur: number; desc?: string }[];
  readonly enableServerTiming?: boolean;
}

/**
 * Compose route-scoped security headers for a given HTTP request pathname.
 */
export function composeRouteSecurityHeaders(options: ComposeHeadersOptions): Record<string, string> {
  const {
    pathname,
    nonce,
    slices = [],
    reportSinkUrl = "/api/reports",
    deliveryMode = "report-uri",
    enableNel = false,
    serverTiming = [],
    enableServerTiming = false,
  } = options;

  // 1. Find all slices that match this specific request route
  const activeSlices = slices.filter((slice) =>
    slice.routes.some((pattern) => matchesRoute(pattern, pathname))
  );

  // 2. Build Route-Scoped Permissions-Policy
  const permissionsMap: Record<string, string[]> = {};
  for (const [feat, defaultAllow] of Object.entries(DEFAULT_PERMISSIONS_POLICY)) {
    permissionsMap[feat] = [...defaultAllow];
  }

  for (const slice of activeSlices) {
    if (slice.permissionsPolicy) {
      for (const [feature, allowList] of Object.entries(slice.permissionsPolicy)) {
        if (!permissionsMap[feature]) permissionsMap[feature] = [];
        for (const origin of allowList) {
          if (!permissionsMap[feature]!.includes(origin)) {
            permissionsMap[feature]!.push(origin);
          }
        }
      }
    }
  }

  const permissionsPolicyParts: string[] = [];
  for (const [feat, origins] of Object.entries(permissionsMap)) {
    if (origins.length === 0) {
      permissionsPolicyParts.push(`${feat}=()`);
    } else {
      const formatted = origins.map((o) => (o === "self" ? "self" : `"${o}"`)).join(" ");
      permissionsPolicyParts.push(`${feat}=(${formatted})`);
    }
  }

  // 3. Build Route-Scoped Content-Security-Policy
  const cspMap: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"],
    "style-src": ["'self'", `'nonce-${nonce}'`],
    "img-src": ["'self'", "data:", "https:"],
    "media-src": ["'self'"],
    "connect-src": ["'self'"],
    "frame-ancestors": ["'none'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "require-trusted-types-for": ["'script'"],
  };

  for (const slice of activeSlices) {
    if (slice.cspDirectives) {
      for (const [directive, sources] of Object.entries(slice.cspDirectives)) {
        // Enforce: No 'unsafe-inline' or 'unsafe-eval' allowed in main document slices
        if (sources.includes("'unsafe-inline'") || sources.includes("'unsafe-eval'")) {
          throw new Error(
            `[security] Slice '${slice.id}' requested '${sources.join(" ")}' in ${directive}. 'unsafe-inline' and 'unsafe-eval' are forbidden.`
          );
        }

        // Enforce LLM Credential Broker: No direct LLM host without client-byok + ADR
        if (directive === "connect-src") {
          for (const src of sources) {
            const isLlm = KNOWN_LLM_HOSTS.some((host) => src.includes(host));
            if (isLlm && (slice.llmMode !== "client-byok" || !slice.adr)) {
              throw new Error(
                `[security] Slice '${slice.id}' requested direct LLM connection '${src}' without llmMode: "client-byok" and an approved ADR.`
              );
            }
          }
        }

        if (!cspMap[directive]) cspMap[directive] = ["'self'"];
        for (const src of sources) {
          if (!cspMap[directive]!.includes(src)) {
            cspMap[directive]!.push(src);
          }
        }
      }
    }
  }

  // Reporting directives
  if (reportSinkUrl) {
    if (deliveryMode === "report-uri" || deliveryMode === "both") {
      cspMap["report-uri"] = [reportSinkUrl];
    }
    if (deliveryMode === "reporting-api" || deliveryMode === "both") {
      cspMap["report-to"] = ["obs"];
    }
  }

  const cspParts: string[] = [];
  for (const [dir, srcList] of Object.entries(cspMap)) {
    cspParts.push(`${dir} ${srcList.join(" ")}`);
  }

  const headers: Record<string, string> = {
    "content-security-policy": cspParts.join("; "),
    "permissions-policy": permissionsPolicyParts.join(", "),
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "x-frame-options": "DENY",
    "cross-origin-opener-policy": "same-origin",
    "cross-origin-resource-policy": "same-origin",
  };

  if (reportSinkUrl) {
    headers["reporting-endpoints"] = `obs="${reportSinkUrl}"`;
    if (deliveryMode === "reporting-api" || deliveryMode === "both") {
      headers["report-to"] = JSON.stringify({
        group: "obs",
        max_age: 86400,
        endpoints: [{ url: reportSinkUrl }],
      });
    }
    if (enableNel && reportSinkUrl.startsWith("https://")) {
      headers["nel"] = JSON.stringify({
        report_to: "obs",
        max_age: 86400,
        include_subdomains: false,
      });
    }
  }

  // Toggleable Server-Timing
  if (enableServerTiming && serverTiming.length > 0) {
    headers["server-timing"] = serverTiming
      .map((entry) => `${entry.name};dur=${Math.round(entry.dur)}${entry.desc ? `;desc="${entry.desc}"` : ""}`)
      .join(", ");
  }

  return headers;
}

/**
 * Attributes for Tier 2 isolated sandboxed iframes.
 */
export function buildSandboxIframeAttributes(sliceCapability?: FeatureCapabilityManifest): Record<string, string> {
  const allowList: string[] = [];
  if (sliceCapability?.permissionsPolicy) {
    for (const [feature, origins] of Object.entries(sliceCapability.permissionsPolicy)) {
      if (origins.includes("self")) {
        allowList.push(`${feature} 'src'`);
      }
    }
  }

  return {
    "sandbox": "allow-scripts",
    "loading": "lazy",
    "referrerpolicy": "no-referrer",
    ...(allowList.length > 0 ? { "allow": allowList.join("; ") } : {}),
    "csp": "default-src 'none'; script-src 'unsafe-inline' blob:; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none';",
  };
}

/**
 * Deterministically composes Web App Manifest capabilities from active feature slices
 * into the base manifest without manual central file edits.
 */
export function composeWebAppManifest(
  baseManifest: Record<string, unknown>,
  slices: readonly FeatureCapabilityManifest[] = []
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...baseManifest };

  const shortcuts = Array.isArray(baseManifest.shortcuts) ? [...baseManifest.shortcuts] : [];
  const fileHandlers = Array.isArray(baseManifest.file_handlers) ? [...baseManifest.file_handlers] : [];
  const protocolHandlers = Array.isArray(baseManifest.protocol_handlers) ? [...baseManifest.protocol_handlers] : [];
  let shareTarget = baseManifest.share_target || null;

  for (const slice of slices) {
    if (!slice.manifest) continue;

    if (slice.manifest.shortcuts) {
      for (const sc of slice.manifest.shortcuts) {
        if (!shortcuts.some((existing: any) => existing.url === sc.url)) {
          shortcuts.push(sc);
        }
      }
    }

    if (slice.manifest.file_handlers) {
      for (const fh of slice.manifest.file_handlers) {
        if (!fileHandlers.some((existing: any) => existing.action === fh.action)) {
          fileHandlers.push(fh);
        }
      }
    }

    if (slice.manifest.protocol_handlers) {
      for (const ph of slice.manifest.protocol_handlers) {
        if (!protocolHandlers.some((existing: any) => existing.protocol === ph.protocol)) {
          protocolHandlers.push(ph);
        }
      }
    }

    if (slice.manifest.share_target && !shareTarget) {
      shareTarget = slice.manifest.share_target;
    }
  }

  result.shortcuts = shortcuts;
  if (fileHandlers.length > 0) result.file_handlers = fileHandlers;
  if (protocolHandlers.length > 0) result.protocol_handlers = protocolHandlers;
  if (shareTarget) result.share_target = shareTarget;

  return result;
}

export interface WellKnownEndpointResponse {
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly body: string;
}

/**
 * Dispatches or synthesizes responses for conditional .well-known endpoints
 * declared by feature slices (e.g. change-password, webauthn, assetlinks, apple-app-site-association).
 */
export function composeWellKnownHandlers(
  slices: readonly FeatureCapabilityManifest[] = []
): Record<string, WellKnownEndpointResponse> {
  const handlers: Record<string, WellKnownEndpointResponse> = {};

  for (const slice of slices) {
    if (!slice.wellKnown) continue;

    if (slice.wellKnown.changePasswordUrl) {
      handlers["/.well-known/change-password"] = {
        status: 302,
        headers: {
          "Location": slice.wellKnown.changePasswordUrl,
          "Cache-Control": "no-store",
        },
        body: "",
      };
    }

    if (slice.wellKnown.webauthnOrigins && slice.wellKnown.webauthnOrigins.length > 0) {
      handlers["/.well-known/webauthn"] = {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "public, max-age=86400",
        },
        body: JSON.stringify({ origins: slice.wellKnown.webauthnOrigins }, null, 2),
      };
    }

    if (slice.wellKnown.assetLinks && slice.wellKnown.assetLinks.length > 0) {
      handlers["/.well-known/assetlinks.json"] = {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "public, max-age=86400",
        },
        body: JSON.stringify(slice.wellKnown.assetLinks, null, 2),
      };
    }

    if (slice.wellKnown.appleAppSiteAssociation) {
      handlers["/.well-known/apple-app-site-association"] = {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "public, max-age=86400",
        },
        body: JSON.stringify(slice.wellKnown.appleAppSiteAssociation, null, 2),
      };
    }
  }

  return handlers;
}
