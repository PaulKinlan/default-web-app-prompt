/**
 * reference/service-worker.ts — Production Service Worker with CSP Nonce Re-Stamping
 *
 * Implements:
 * 1. Safe update lifecycle: Never auto-skipWaiting over an active controller.
 * 2. Shared CSP nonce re-stamping for cached HTML shells (Paul Kinlan's 2018 pattern).
 * 3. Cache versioning by commit SHA and stale cache purging.
 * 4. Staged message handling ('SKIP_WAITING') and emergency kill-switch ('KILL_SW').
 */

let swNonceCounter = 0;

/**
 * Generate a cryptographically random, namespaced Service Worker nonce.
 * Prepends 'sw-' to ensure zero collision with server-generated 'srv-' nonces.
 */
export function generateSwNonce(sourcePrefix = "sw"): string {
  swNonceCounter = (swNonceCounter + 1) % 1000000;
  const randomBytes = new Uint8Array(8);
  crypto.getRandomValues(randomBytes);
  let randomHex = "";
  for (let i = 0; i < randomBytes.length; i++) {
    randomHex += randomBytes[i]!.toString(16).padStart(2, "0");
  }
  return `${sourcePrefix}-${Date.now().toString(36)}-${swNonceCounter.toString(36)}-${randomHex}`;
}

export interface NonceRewriteResult {
  readonly html: string;
  readonly headers: Record<string, string>;
  readonly nonce: string;
}

/**
 * Rewrites a cached HTML shell and its HTTP headers with a fresh cryptographic nonce.
 * Ensures cached HTML responses never violate strict CSP by reusing expired nonces.
 */
export function rewriteCachedHtmlWithFreshNonce(
  html: string,
  originalHeaders: Record<string, string> | Headers = {},
  customNonce?: string
): NonceRewriteResult {
  const nonce = customNonce || generateSwNonce("sw");

  // Normalize headers
  const headers: Record<string, string> = {};
  if (typeof (originalHeaders as any).entries === "function") {
    for (const [k, v] of (originalHeaders as Headers).entries()) {
      headers[k.toLowerCase()] = v;
    }
  } else {
    for (const [k, v] of Object.entries(originalHeaders)) {
      headers[k.toLowerCase()] = v;
    }
  }

  // Rewrite Content-Security-Policy header
  const existingCsp = headers["content-security-policy"];
  if (existingCsp) {
    // Replace existing 'nonce-...' tokens with the fresh SW nonce
    headers["content-security-policy"] = existingCsp.replace(/'nonce-[^']+'/gu, `'nonce-${nonce}'`);
  }

  // Stamp telemetry headers
  headers["x-served-by"] = "service-worker-cache";
  headers["x-sw-nonce"] = nonce;

  // Rewrite script and style nonce attributes in HTML stream
  const rewrittenHtml = html
    .replace(/(<(?:script|style)[^>]*\snonce=)(["'])[^"']*\2/giu, `$1"${nonce}"`)
    .replace(/(<(?:script|style)[^>]*\sdata-nonce=)(["'])[^"']*\2/giu, `$1"${nonce}"`);

  return {
    html: rewrittenHtml,
    headers,
    nonce,
  };
}

export interface ServiceWorkerControllerConfig {
  readonly commit: string;
  readonly shellRoutes?: readonly string[];
  readonly staticPrefixes?: readonly string[];
  readonly scope?: string;
}

/**
 * Service Worker controller logic designed for standard browser Service Worker contexts
 * or WinterCG-compatible test mock harnesses.
 */
export function createServiceWorkerController(config: ServiceWorkerControllerConfig) {
  const {
    commit,
    shellRoutes = ["/", "/index.html", "/tokens.css"],
    staticPrefixes = ["/assets/", "/icons/", "/screenshots/", "/tokens.css"],
  } = config;

  const SHELL_CACHE = `shell-${commit}`;
  const STATIC_CACHE = `static-${commit}`;
  const VALID_CACHES = new Set([SHELL_CACHE, STATIC_CACHE]);

  /** Install: Pre-cache app shell. Only auto-skipWaiting if no controller exists yet. */
  async function handleInstall(
    event: any,
    swGlobal: { registration: any; skipWaiting: () => Promise<void>; caches: any }
  ) {
    const cache = await swGlobal.caches.open(SHELL_CACHE);
    await cache.addAll(shellRoutes);

    // If an active controller already exists, DO NOT auto-skipWaiting!
    // Staging the update prevents breaking in-flight lazy imports in active tabs.
    const hasActiveController = Boolean(swGlobal.registration?.active);
    if (!hasActiveController) {
      await swGlobal.skipWaiting();
    }
  }

  /** Activate: Purge stale caches from older commits. */
  async function handleActivate(
    event: any,
    swGlobal: { caches: any; clients: { claim: () => Promise<void> } }
  ) {
    const keys = await swGlobal.caches.keys();
    await Promise.all(
      keys.filter((key: string) => !VALID_CACHES.has(key)).map((key: string) => swGlobal.caches.delete(key))
    );
    if (swGlobal.clients && typeof swGlobal.clients.claim === "function") {
      await swGlobal.clients.claim();
    }
  }

  /** Handle messages from clients (staged reload or emergency kill-switch) */
  async function handleMessage(
    event: { data?: { type?: string } },
    swGlobal: { skipWaiting: () => Promise<void>; registration: any; caches: any }
  ) {
    const type = event.data?.type;
    if (type === "SKIP_WAITING") {
      await swGlobal.skipWaiting();
    } else if (type === "KILL_SW") {
      await killSwitch(swGlobal);
    }
  }

  /** Handle network fetches with appropriate caching strategy */
  async function handleFetch(
    request: { url: string; method: string; mode?: string; headers?: any },
    swGlobal: { caches: any; fetch: (req: any) => Promise<any> }
  ): Promise<any> {
    const url = new URL(request.url);

    // 1. Network-Only for API and admin endpoints
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/__admin")) {
      return swGlobal.fetch(request);
    }

    // 2. Cache-First for versioned/static assets
    const isStatic = staticPrefixes.some((prefix) => url.pathname.startsWith(prefix));
    if (isStatic && request.method === "GET") {
      const cached = await swGlobal.caches.match(request);
      if (cached) return cached;
      const response = await swGlobal.fetch(request);
      if (response && response.status === 200) {
        const cache = await swGlobal.caches.open(STATIC_CACHE);
        await cache.put(request, response.clone());
      }
      return response;
    }

    // 3. Network-First with CSP-nonce-restamped fallback for HTML navigations
    if (request.mode === "navigate" || request.headers?.get?.("accept")?.includes("text/html")) {
      try {
        const networkResponse = await swGlobal.fetch(request);
        if (networkResponse && networkResponse.status === 200) {
          const cache = await swGlobal.caches.open(SHELL_CACHE);
          await cache.put(request, networkResponse.clone());
        }
        return networkResponse;
      } catch (err) {
        // Offline navigation fallback: retrieve shell and re-stamp fresh CSP nonce
        const cachedShell = (await swGlobal.caches.match(request)) || (await swGlobal.caches.match("/"));
        if (cachedShell) {
          const rawHtml = await cachedShell.text();
          const { html, headers } = rewriteCachedHtmlWithFreshNonce(rawHtml, cachedShell.headers);
          return new Response(html, {
            status: 200,
            headers: new Headers(headers),
          });
        }
        throw err;
      }
    }

    // Default: network pass-through
    return swGlobal.fetch(request);
  }

  /** Emergency Kill-Switch: Unregisters Service Worker and wipes all caches */
  async function killSwitch(swGlobal: { registration: any; caches: any }): Promise<void> {
    if (swGlobal.registration && typeof swGlobal.registration.unregister === "function") {
      await swGlobal.registration.unregister();
    }
    if (swGlobal.caches) {
      const keys = await swGlobal.caches.keys();
      await Promise.all(keys.map((k: string) => swGlobal.caches.delete(k)));
    }
  }

  return {
    SHELL_CACHE,
    STATIC_CACHE,
    handleInstall,
    handleActivate,
    handleMessage,
    handleFetch,
    killSwitch,
  };
}
