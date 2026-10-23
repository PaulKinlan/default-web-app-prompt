# Master Prompt: Production-Grade Web Application Specification & Protocol

> **How to use this prompt:**
> - **Copy prompt to clipboard via curl (`pbcopy`)**:
>   ```bash
>   curl -fsSL https://raw.githubusercontent.com/PaulKinlan/default-web-app-prompt/main/PROMPT.md | pbcopy
>   ```
> - **Paste into your agent coding session**: Paste this entire prompt alongside your specific app idea, requirements, or user stories.
> - **Turn-1 Automatic Bootstrap**: When this prompt is pasted into a new project, the agent executes this one-liner to fetch all templates, reference modules, and gate scripts directly from GitHub into the current workspace:
>   ```bash
>   curl -fsSL https://raw.githubusercontent.com/PaulKinlan/default-web-app-prompt/main/install.sh | bash -s -- . "<app-name>"
>   ```
> - The agent **must** follow this protocol strictly across all iterations, builds, and PRs.

---

## 1. Kickoff & Discovery Protocol (ADR-First, Ask Only If Ambiguous)

When starting a project, infer as much as possible from the user's initial request. If any core architectural fork is ambiguous, ask a compact, numbered question block before writing feature code.

Always establish these four choices on Turn 1 and document them in `docs/adr/0001-baseline-and-architecture.md`:

1. **Web Platform Baseline**:
   - **Recommended Default**: **Baseline Newly Available** (features supported across all major browser engines for less than 30 months).
   - **Widely Available**: For strict backwards-compatibility mandates (supported across all engines for > 30 months).
   - **Cutting-Edge / Origin-Trial APIs**: Permitted (e.g. `navigator.crashReporter`, Chrome Built-in AI / Prompt API, Speculation Rules), but **strictly required** to sit behind runtime feature detection (`if ('crashReporter' in navigator)`) and provide an immediate functional fallback for other engines.
2. **Framework & Client Stack**:
   - **Recommended Default**: **Vanilla Web Platform / No Framework** (Standard Custom Elements / Web Components, native ES modules, CSS `@layer` & `@scope`, and standard WinterCG `fetch(Request) -> Response` handlers).
   - **Framework Opt-In**: If an external framework is requested (e.g. Preact, Lit, React, Hono, Astro), record the choice in an ADR and adapt the vertical feature slice manifests accordingly.
3. **Hosting Platform & Edge Runtime**:
   - **Recommended Default**: **Cloudflare** (Cloudflare Workers + Workers Static Assets + D1 / Durable Objects with SQLite storage + KV / R2).
   - **WinterCG Portability**: All route handlers and business logic **must** adhere strictly to WinterCG Web Standards (`Request`, `Response`, `URLPattern`, `Web Crypto`, `ReadableStream`) so vertical slices remain directly portable between Cloudflare, Deno Deploy, Node.js, and browser service workers.
4. **Visual Direction, Sample Sites & Reference Images**:
   - Explicitly ask the user for their design aesthetic (e.g. editorial/swiss typographic, high-craft industrial/technical, warm organic, atmospheric dark minimalism).
   - **Sample Reference Sites**: Ask the user to supply 1–3 sample websites (URLs) whose layout, pacing, typography, or interaction feel they admire (and any anti-patterns to avoid). Inspect these URLs via browser inspection tools to analyze their visual density and tokens.
   - **Reference Images & Screenshots**: If the user provides mockups, sketches, or screenshots, place them in `docs/design-references/` and record their color palettes, spacing rhythm, and layout geometry.
   - **Mandatory `DESIGN.md`**: Codify the aesthetic persona, reference takeaways, typography scales, and token choices into a root `DESIGN.md` file.
   - **Ban generic "AI Slop"**: No generic purple/indigo gradients, no unstyled white card grids, no boilerplate SaaS dashboard clichés.

### 1.1 Turn-1 Bootstrapping Command
Record all kickoff decisions as Architectural Decision Records (`docs/adr/0000-...` and `docs/adr/0001-...`).
If the workspace has not yet been initialized with the reference scripts and templates, run the installer one-liner immediately:
```bash
curl -fsSL https://raw.githubusercontent.com/PaulKinlan/default-web-app-prompt/main/install.sh | bash -s -- . "<app-name>"
```
This fetches and installs `AGENTS.md`, `THREAT_MODEL.md`, `DESIGN.md`, `wrangler.jsonc`, `perf-budget.json`, `public/tokens.css`, `public/.well-known/*`, `public/manifest.webmanifest`, `src/lib/*.ts`, and `scripts/{fast-gate.sh,full-gate.sh,single-owner.mjs,check-capabilities.mjs,check-perf-budget.mjs,check-discovery.mjs,test-selection.mjs}` directly from GitHub.

---

## 2. Standing Priorities (Order of Operations)

Every architectural decision, code review, task decomposition, and merge must optimize for these priorities in strict order:

1. **Performance**: Initial paint within 1 TCP window (<= 14 KiB critical HTML+CSS), zero render-blocking scripts, instant turn loops, low interaction latency (INP <= 50ms), and sub-minute CI test execution.
2. **Security & Privacy**: Zero-trust default-deny security posture. Enforced cryptographic CSP nonces, zero `'unsafe-inline'`, full `Permissions-Policy` restriction, sandboxed iframes for untrusted/LLM outputs, and zero client-side raw credentials.
3. **Resilience & Observability**: "No Excuses" telemetry built on day one. W3C Reporting API, Real-User Core Web Vitals, Long Animation Frames (LoAF) attribution, crash breadcrumbs, offline mutation queues, and longitudinal time-series tracking with zero data loss.
4. **Mergeability**: Composed architecture for high agent concurrency. Vertical feature slices (`src/features/<id>/`), auto-discovery, event/command micro-bus, slot shell composition, and derived affected-test selection with zero file conflicts on shared registries.
5. **Design, UI & Accessibility**: High visual craft, token-first OKLCH color palettes, full 10-state UI completeness, WCAG 2.1 AA compliance, and responsive ergonomics.
6. **Features**: Capabilities built on narrow interfaces and measured component seams.

---

## 3. Mandatory Skill & Plugin Loop

On **every single task, build, and PR iteration**, the agent **must** run the following specialized skill loop:

- **Step 0 (Before Coding Frontend — modern-web-guidance)**: You **must** install and execute the `modern-web-guidance` skill first. Web standards move rapidly; training weights contain obsolete patterns. Search for native HTML/CSS/JS APIs before considering polyfills or libraries. If `modern-web-guidance` is not already installed, install it immediately via `npx -y modern-web-guidance@latest install` or `agy plugin install https://github.com/GoogleChrome/modern-web-guidance`. Run `npx -y modern-web-guidance@latest search "<query>"` before writing any component code.
- **Step 1 (While Developing & Debugging)**: Use `chrome-devtools-mcp` (`chrome-devtools` skill) for all web inspection, DOM state verification, network call inspection, and console verification. Never rely on blind guesses or curl-only debugging for browser applications.
- **Step 2 (Accessibility Verification)**: Run `a11y-debugging` on every user-facing view. Verify semantic HTML landmarks, keyboard navigation order, focus visibility, screen reader labels, minimum tap targets, and color contrast.
- **Step 3 (Performance Tuning)**: Use `debug-optimize-lcp` whenever modifying views, assets, or layout to ensure LCP and CWV metrics stay in the "Good" band.
- **Step 4 (Resilience Audit)**: Before completing any user-facing milestone, audit against the 46-state matrix using `web-resilience-audit` and apply fixes via `web-resilience-fix`.

---

## 4. Frameworks, Hosting Platforms & WinterCG Portability

### 4.1 Zero-Framework Vanilla Default
- Prefer native browser primitives over third-party component libraries.
- Encapsulate UI elements as standard Web Components (`customElements.define('app-feature', class extends HTMLElement ...)`).
- Use CSS `@scope` or `@layer components` for styling encapsulation without requiring shadow DOM when light DOM styling is advantageous.
- Zero client-side third-party npm dependencies by default. Any added client npm dependency requires an ADR in `docs/adr/` demonstrating that native web platform APIs cannot fulfill the requirement.

### 4.2 Cloudflare-First Edge Profile
- Configuration: Standard `wrangler.jsonc` (or `wrangler.toml`).
- Static Assets: Cloudflare Workers Static Assets (`assets = { directory = "./public" }` or `dist`).
- State & Storage:
  - SQLite inside Durable Objects (`new_sqlite_classes`) for strongly consistent, actor-isolated state.
  - WebSocket Hibernation (`ctx.acceptWebSocket`) so long-lived streaming connections and HUD feeds cost zero compute while idle.
  - Cloudflare D1 for relational queries and analytics rollups; KV / R2 for content-addressed assets.
- Secret Hygiene: No raw secrets committed or baked into client bundles. Use `wrangler secret put` and local `.dev.vars` (always in `.gitignore`).

### 4.3 WinterCG Portability Standard
All server route handlers and middleware must consume standard web standard primitives:
- `fetch(request: Request): Promise<Response>`
- `URLPattern` for routing dispatch
- Web Cryptography API (`crypto.subtle`, `crypto.getRandomValues`)
- Web Streams API (`ReadableStream`, `TransformStream`, `CompressionStream`)

---

## 5. Design, UI Architecture & Aesthetics

### 5.1 Mandated DESIGN.md, Reference Sites/Images & Banishing AI Slop
- **Mandatory `DESIGN.md` System Contract**: Every application must create and maintain a root `DESIGN.md` specification (scaffolded from `templates/DESIGN.md` on Turn 1). All agents developing or reviewing UI slices must read and conform to `DESIGN.md`.
- **Reference Sites & Reference Images Inquiry**:
  - During kickoff and any visual refactor, actively ask the user:
    > *"Please share 1–3 sample websites (URLs) or reference images/screenshots whose aesthetic, typography, spatial density, or interaction feel you admire, as well as any sites or patterns you want to avoid."*
  - **Inspecting Sample Sites**: When the user provides URLs, inspect them using browser developer tools (`chrome-devtools-mcp`) to analyze their font stacks, line-heights, container max-widths, and color tokens.
  - **Analyzing Reference Images**: When the user provides screenshots or mockups, save them in `docs/design-references/`, catalog their visual attributes in `DESIGN.md`, and translate their palette into `@layer tokens` in `public/tokens.css`.
- **Intentional Aesthetic**: Every project must have an explicit visual identity defined in `docs/adr/0001-...`, `DESIGN.md`, and `tokens.css`. Avoid default purple gradients, generic SaaS rounded cards with weak borders, and unstyled system defaults.
- **Visual Hierarchy**: Every screen must have exactly one primary call to action, clear typographic scale, and deliberate use of whitespace.
- **Tone**: Plain, direct, non-anthropomorphic technical language in UI copy, documentation, and error messages.

### 5.2 Token-First Modern CSS (`@layer tokens`)
- Define semantic CSS custom properties in `@layer tokens`:
  ```css
  @layer reset, tokens, base, components, utilities;

  @layer tokens {
    :root {
      color-scheme: light dark;
      /* OKLCH perceptual palettes */
      --bg: light-dark(oklch(98% 0.005 240), oklch(14% 0.01 240));
      --fg: light-dark(oklch(18% 0.02 240), oklch(95% 0.005 240));
      --card: light-dark(oklch(100% 0 0), oklch(18% 0.015 240));
      --line: light-dark(oklch(88% 0.01 240), oklch(28% 0.02 240));
      --muted: light-dark(oklch(45% 0.02 240), oklch(70% 0.01 240));
      --accent: light-dark(oklch(55% 0.22 255), oklch(72% 0.18 255));
      --ok: light-dark(oklch(52% 0.18 145), oklch(72% 0.18 145));
      --warn: light-dark(oklch(62% 0.18 65), oklch(78% 0.16 65));
      --bad: light-dark(oklch(52% 0.22 25), oklch(70% 0.20 25));
      --focus-ring: light-dark(oklch(50% 0.24 255), oklch(75% 0.20 255));

      /* Fluid Typography & Spacing */
      --font-body: system-ui, -apple-system, sans-serif;
      --font-mono: ui-monospace, 'SF Mono', Menlo, monospace;
      --text-sm: clamp(0.8125rem, 0.8rem + 0.1vw, 0.875rem);
      --text-base: clamp(0.9375rem, 0.9rem + 0.2vw, 1.0625rem);
      --text-lg: clamp(1.25rem, 1.15rem + 0.5vw, 1.5rem);
      --text-xl: clamp(1.75rem, 1.5rem + 1vw, 2.25rem);
      --space-xs: 4px;
      --space-sm: 8px;
      --space-md: 16px;
      --space-lg: 24px;
      --space-xl: 32px;
      --radius: 8px;
    }
  }
  ```
- **Zero Hardcoded Values**: Component rules must reference semantic CSS tokens (`var(--bg)`, `var(--accent)`). Hardcoded hex or RGB strings in component CSS are forbidden and checked by static linting.

### 5.3 The 10-State UI Completeness Matrix
Every interactive component or view must explicitly implement and handle all 10 states:
1. **Default**: Baseline resting state.
2. **Hover**: Smooth pointer highlight.
3. **`:focus-visible`**: Mandatory `3px` solid focus ring with `outline-offset: 2px` (never `outline: none`).
4. **Active / Pressed**: Immediate tactile feedback.
5. **Disabled**: `aria-disabled="true"`, reduced opacity, cursor not-allowed, stripped click events.
6. **Loading**: Skeletons for operations > 300ms, `aria-busy="true"` on the loading container.
7. **Empty**: Explains what was queried, that zero records matched, and provides the immediate next action.
8. **Error**: Self-diagnosing, actionable copy explaining what failed and how to recover (no raw unformatted stack traces).
9. **Offline / Stale**: Indicator showing cached status, last sync timestamp, and pending queued mutations.
10. **Dark / Light Mode**: Handled natively via `light-dark()` and `color-scheme: light dark`.

### 5.4 Ergonomic & Accessibility Standards
- **Tabular Numerals**: Apply `font-variant-numeric: tabular-nums` to all timers, tables, counters, and metrics to prevent layout jitter.
- **Scroll Containment**: Apply `overscroll-behavior: contain` to all modals, drawers, and nested scrollable panels to prevent background page scroll-jacking.
- **Touch Targets**: Minimum interactive dimensions of `24x24px` (with `44x44px` touch target bounding box).
- **Contrast**: WCAG 2.1 AA contrast ratios (`>= 4.5:1` for regular text, `>= 3:1` for large text and UI component borders).

---

## 6. Modern Web Platform Capabilities Catalogue

### 6.1 Mandatory Installation & Execution of GoogleChrome/modern-web-guidance
AI coding agents often default to outdated patterns or heavy npm libraries because training data is saturated with legacy code. The [`GoogleChrome/modern-web-guidance`](https://github.com/GoogleChrome/modern-web-guidance) project **must be installed and queried** before implementing any HTML, CSS, or client-side JavaScript feature.

- **Installation**:
  - Direct Wizard: `npx -y modern-web-guidance@latest install`
  - Google Antigravity: `agy plugin install https://github.com/GoogleChrome/modern-web-guidance`
  - Vercel skills CLI: `npx skills add GoogleChrome/modern-web-guidance`
  - GitHub CLI: `gh skill install GoogleChrome/modern-web-guidance`
- **Mandatory Query Workflow (Before Writing Frontend Code)**:
  1. **Search**: Run `npx -y modern-web-guidance@latest search "<action-oriented query>"` (e.g. `npx -y modern-web-guidance@latest search "animate dialog backdrop"`).
  2. **Retrieve**: Run `npx -y modern-web-guidance@latest retrieve "<guide-id>"` (e.g. `npx -y modern-web-guidance@latest retrieve "animate-to-from-top-layer"`).
  3. **Browse Catalogue**: If search results are ambiguous or empty, inspect all guides with `npx -y modern-web-guidance@latest list`.

### 6.2 Core Platform Capabilities Principles
Agents must prioritize these native platform features over third-party JavaScript implementations:

- **Modals & Overlays**: Native `<dialog>` element (`showModal()`, `close()`) and the Popover API (`popover="auto|manual"`).
- **Invoker Commands**: `command` and `commandfor` attributes for zero-JS button-driven dialogs, popovers, and disclosures.
- **Positioning**: CSS Anchor Positioning (`anchor-name`, `position-anchor`, `position-area`) for zero-JS tooltips, dropdowns, and flyout menus.
- **Accordions**: Native `<details name="...">` for exclusive accordion groups without JavaScript listeners.
- **Entry & Exit Animations**: `@starting-style` and `transition-behavior: allow-discrete` for animating `display: none` and popover transitions.
- **Page Transitions**: View Transitions API (`@view-transition { navigation: auto }` for multi-page, `document.startViewTransition()` for SPAs), always wrapped in `@media (prefers-reduced-motion: no-preference)`.
- **Scroll Effects**: Scroll-Driven Animations (`animation-timeline: scroll()` and `view()`).
- **Layout & Scope**: CSS Grid, Subgrid, Container Queries (`@container`), `:has()`, `:user-valid` / `:user-invalid`, and `@scope`.
- **Main-Thread Responsiveness**: `await scheduler.yield()` to break long JavaScript tasks (> 50ms) into discrete micro-tasks to guarantee INP < 50ms.
- **Navigation Pre-fetching**: Speculation Rules API (`<script type="speculationrules">`) for pre-rendering predicted subsequent navigations.
- **Multi-Tab Communication**: `BroadcastChannel` for instant state synchronization across browser tabs; `SharedWorker` for background coordination.
- **Client Storage**: Origin Private File System (OPFS) and IndexedDB for high-performance offline storage.
- **Built-in AI**: Native client-side Prompt API (`window.ai.languageModel`), Summarizer API, Translator API, and Language Detector API.
- **WebMCP**: Declarative and imperative form-associated agent tooling.

---

## 7. Multi-Agent Mergeability Architecture (Zero File Clashes)

To enable dozens of autonomous agents to develop features in parallel without merge conflicts, applications must follow this strict decoupled architecture:

### 7.1 Vertical Feature Slices (`src/features/<feature-id>/`)
All features are completely self-contained in dedicated directories:
```
src/features/<feature-id>/
  ├── routes.ts         # WinterCG route handlers for this feature
  ├── ui.ts             # Web Component definitions and rendering logic
  ├── styles.css        # Scoped component styles (@scope or @layer components)
  ├── capabilities.ts   # Declarative security capability manifest
  └── <feature-id>.test.ts # Scoped unit and contract tests
```

### 7.2 Build-Time / Boot-Time Slice Discovery
- Feature slices must **never** be manually imported into a central monolithic router or registry file.
- A deterministic discovery script (`scripts/build-manifest.ts`) scans `src/features/*/` and generates `.generated/feature-manifest.ts` (gitignored).
- This ensures zero file clashes when multiple agents add or remove features, and works seamlessly across local filesystem runtimes (Node/Deno) and edge bundlers (Cloudflare Workers/Vite).

### 7.3 Slot / Region Shell Composition
- The root document (`index.html`) defines semantic regions:
  ```html
  <header data-slot="header"></header>
  <main data-slot="main"></main>
  <aside data-slot="sidebar"></aside>
  <div data-slot="modals"></div>
  <footer data-slot="footer"></footer>
  ```
- Feature slices register their target slot declaratively in their manifest. The page shell mounts slices into their respective slots automatically—no agent ever edits a central `index.html` to inject a feature.

### 7.4 Declarative Client Micro-Bus (`< 1 KB`) & Lazy Hydration
- Components never import or couple directly to each other.
- All inter-component communication happens via a typed event/command micro-bus (`reference/micro-bus.ts`):
  ```ts
  bus.emit('cart:item-added', { id: 'item-1', price: 20 });
  bus.command('modal:open', { target: 'checkout-dialog' });
  ```
- **Zero JS Blocking LCP**: The micro-bus microkernel listens for user events, Invoker Commands (`commandfor`), or `IntersectionObserver` viewport entry, and dynamically imports the feature slice Web Component on demand. Unused features cost zero initial JavaScript execution.

### 7.5 Single-Owner Invariants
Enforced by `scripts/single-owner.mjs`:
- One fact, one computing site.
- Exactly one module generates cryptographic CSP nonces.
- Exactly one module composes response security headers.
- Exactly one module manages database connections.

---

## 8. Security & Privacy by Default (Two-Tier Capabilities)

### 8.1 Per-Response Cryptographic Nonces & Strict CSP
Every HTML response (including 404, 421, and 500 error pages) must attach a strict Content Security Policy with a fresh 128-bit cryptographic nonce:
```http
Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-RANDOM_BASE64' 'strict-dynamic'; style-src 'self' 'nonce-RANDOM_BASE64'; img-src 'self' data: https:; media-src 'self' blob: https:; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; require-trusted-types-for 'script'; report-uri /api/reports;
```
- **Forbidden**: `'unsafe-inline'`, `'unsafe-eval'`, and inline `style="..."` attributes.
- JSON API responses must attach: `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`.

### 8.2 Default-Deny `Permissions-Policy`
Every powerful browser capability is explicitly disabled by default:
```http
Permissions-Policy: accelerometer=(), ambient-light-sensor=(), autoplay=(), battery=(), bluetooth=(), browsing-topics=(), camera=(), ch-ua-high-entropy-values=(), clipboard-read=(), clipboard-write=(self), compute-pressure=(), cross-origin-isolated=(), display-capture=(), encrypted-media=(), execution-while-not-rendered=(), execution-while-out-of-viewport=(), fullscreen=(self), gamepad=(), geolocation=(), gyroscope=(), hid=(), identity-credentials-get=(), idle-detection=(), interest-cohort=(), join-ad-interest-group=(), keyboard-map=(), local-fonts=(), magnetometer=(), microphone=(), midi=(), navigation-override=(), otp-credentials=(), payment=(), picture-in-picture=(), publickey-credentials-create=(), publickey-credentials-get=(), run-ad-auction=(), screen-wake-lock=(), serial=(), shared-autofill=(), smart-card=(), speaker-selection=(), storage-access=(), sync-xhr=(), unload=(), usb=(), vertical-scroll=(), web-share=(), window-management=(), xr-spatial-tracking=()
```

### 8.3 Two-Tier Capability Unlocking
1. **Tier 1 (Route-Scoped Capabilities)**:
   - Feature slices declare needed capabilities in `src/features/<id>/capabilities.ts`.
   - Capabilities are unlocked **only** on the specific route patterns matching the slice (e.g. `microphone=(self)` is unlocked only on `/record`, while `/` and `/admin` remain locked down).
2. **Tier 2 (Lazy Sandboxed Iframe Boundary)**:
   - Any untrusted, user-generated, third-party, or LLM-generated HTML/Markdown output **must** render inside an isolated iframe:
     ```html
     <iframe sandbox="allow-scripts" loading="lazy" referrerpolicy="no-referrer" src="about:blank"></iframe>
     ```
   - Sandboxed iframes run under a null origin with `connect-src 'none'`.
   - Communication with the parent application occurs strictly over a schema-validated `MessageChannel` / `postMessage` bridge with explicit `event.origin` and `event.source` verification.

### 8.4 LLM Security & Credential Broker Rule
- **No Raw Keys in Client**: Secret tokens (`GEMINI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`) must never appear in client bundles, `localStorage`, or browser network requests.
- **Server Proxy by Default**: All remote model invocations must proxy through a backend handler or `CredentialBroker` (`connect-src 'self'`).
- **Client-Side BYOK / WebLLM**: Client-side direct LLM API calls are permitted only when explicitly requested as a BYOK feature. Any direct external domain in `connect-src` requires an entry in `THREAT_MODEL.md` and an accompanying ADR.
- **Gate Enforcement**: `scripts/check-capabilities.mjs` verifies that every declared capability in `src/features/*/capabilities.ts` matches a verified entry in `THREAT_MODEL.md`. Any undocumented capability fails the gate.

### 8.5 Two-Tier `.well-known` & Root Discovery Metadata
1. **Mandatory Baseline Discovery Files** (Scaffolded on Day 1 in `public/`):
   - `/.well-known/security.txt`: RFC 9116 compliant security contacts, disclosure policy, and an `Expires:` ISO-8601 timestamp. The implementer fast gate (`scripts/check-discovery.mjs`) strictly enforces non-expired timestamps in CI.
   - `/.well-known/traffic-advice`: Chrome Private Prefetch Proxy configuration (`[{"user_agent": "prefetch-proxy", "google_prefetch_proxy_eap": {"fraction": 1.0}}]`) served with `application/trafficadvice+json`.
   - `/humans.txt`: Transparent team attribution, web platform standards, and tooling manifest.
   - `/robots.txt`: Search crawler indexing rules, explicit AI crawler policies (`GPTBot`, `Google-Extended`, `ClaudeBot`), and `Sitemap:` pointer.
   - `/llms.txt`: Machine-readable markdown guide for autonomous agents explaining architecture, public routes, and access policies.
2. **Conditional Capability-Unlocked `.well-known` Endpoints**:
   - Feature slices declare conditional discovery endpoints in `src/features/<id>/capabilities.ts` (`wellKnown: { ... }`):
     - `/.well-known/change-password`: Synthesized redirect to password management when auth slice is present.
     - `/.well-known/webauthn`: Valid origins list for passkeys when WebAuthn slice is present.
     - `/.well-known/assetlinks.json`: Android Digital Asset Links for TWA / WebAPK deep linking.
     - `/.well-known/apple-app-site-association`: iOS Universal Links and WebCredentials declarations.
   - Endpoints are synthesized via `composeWellKnownHandlers()`. Any OS-level or auth `.well-known` declaration must be registered in `THREAT_MODEL.md` §3 with an ADR.

### 8.6 Composable Web App Manifest (`manifest.webmanifest`)
- **Rich Installability Baseline**: Every application scaffolds `public/manifest.webmanifest` defining core identity: `id`, `name`, `short_name`, `start_url`, `display: "standalone"`, `display_override: ["window-controls-overlay", "standalone", "minimal-ui"]`, `background_color`, `theme_color`, SVG + PNG maskable icons, and multi-form-factor `screenshots` (`wide` and `narrow`).
- **Feature-Slice Composition (`composeWebAppManifest`)**:
   - Feature slices declaratively contribute OS integration surfaces in `capabilities.ts`: `shortcuts`, `share_target`, `file_handlers`, and `protocol_handlers`.
   - Manifest composition merges contributions deterministically without manual central edits to `manifest.webmanifest`.
   - Any slice declaring OS input surfaces (`share_target`, `file_handlers`, `protocol_handlers`) is audited by `scripts/check-capabilities.mjs` and requires an entry in `THREAT_MODEL.md` §3 with an approved ADR.

---

## 9. Comprehensive Longitudinal Observability ("No Excuses", Zero Data Loss)

Observability must be built into every project on Day 1.

### 9.1 Browser Telemetry Ingestion
- **W3C Reporting API & CSP Collector (`POST /api/reports`)**:
  - Ingests both `application/reports+json` and legacy `application/csp-report`.
  - Captures `csp-violation`, `crash` (including renderer OOM crashes sent out-of-band), `network-error` (NEL), `coep`, `coop`, `permissions-policy-violation`, `deprecation`, and `intervention`.
  - Classifies severity: `crash` -> `error`; `csp-violation`, `permissions-policy-violation`, `coep` -> `warn`; `deprecation`, benign client NEL -> `info`.
- **Client-Side `ReportingObserver`**:
  - Initializes `new ReportingObserver(...)` buffering and forwarding reports via `navigator.sendBeacon('/api/reports', ...)`.
- **Crash Reporting Key-Value Breadcrumbs (`navigator.crashReporter`)**:
  - Feature-detects Chrome 145+ `navigator.crashReporter.setKey()` to continuously stamp `commit`, `route`, `correlation_id`, `last_bus_command`, and `memory_pressure` so renderer crashes carry exact reproduction state.
- **Attribute-Level Core Web Vitals & LoAF (`PerformanceObserver`)**:
  - **LCP**: Value, element CSS selector, URL, load duration.
  - **INP**: Value, interaction target CSS selector, interaction type.
  - **CLS**: Value, shifted node CSS selectors, shift rects.
  - **LoAF**: Long Animation Frames (> 50ms), capturing total blocking duration, script source URL, function name, and character position.
  - Classified into `info` (good), `warn` (needs improvement), and `error` (poor) based on standard Web Vitals thresholds.
- **Global Error Traps**:
  - `window.addEventListener('error', ..., true)` with `capture: true` to catch script/link/image resource load failures.
  - `window.addEventListener('unhandledrejection')`.
  - `document.addEventListener('securitypolicyviolation')`.
- **Toggleable `Server-Timing`**:
  - Server spans emit `Server-Timing` headers **only** when `OBS_SERVER_TIMING=1` or for authenticated admin sessions. Omitted by default in production.

### 9.2 Longitudinal Zero-Data-Loss Storage
- **Append-Only Event Store**: Monotonic gap-free `seq` cursor in durable storage (SQLite / Cloudflare D1 / Durable Objects SQLite / KV + cold object archival).
- **Write-Time Fingerprint Deduplication**:
  - Public collector endpoints enforce a 64 KiB stream limit before parsing, strip prototype-pollution keys, redact secret patterns (`[redacted]`), and apply per-IP rate limits.
  - Deduplicates events by `SHA-256(type, severityBand, normalizedRoute, keyDetail)`. Repeated floods increment `occurrences` and `lastSeenAt` without dropping distinct history.
- **Permanent Percentile Rollups**:
  - Hourly and per-commit rollup tables permanently store `p50`, `p75`, `p95`, `p99`, counts, and error totals across every deployment forever.

### 9.3 Observability Endpoints
- `GET /health` (and `/__health`): Root unauthenticated health status reporting commit SHA, commit source, commit key, and component readiness.
- `GET /api/observability/summary?since=<seq>` & `GET /api/observability/errors?since=<seq>`: Authenticated sequence-cursor log feeds, **exempt from the host gate** to ensure broken routing configurations can be diagnosed.
- `GET /api/observability/trends`: Longitudinal trend API comparing CWV percentiles and error rates across commits.
- `GET /__admin`: Private, CSP-compliant dashboard (zero inline scripts or styles) displaying live traces, CWV trends, and system health.

---

## 10. Performance Criteria & Continuous Ratchet

- **Targets**:
  - LCP <= 1200ms (Target), <= 2500ms (Max Floor)
  - INP <= 50ms (Target), <= 200ms (Max Floor)
  - CLS = 0 (Target), <= 0.1 (Max Floor)
- **Continuous Performance Ratchet (`perf-budget.json`)**:
  - Initial critical HTML + CSS <= 14 KiB gzipped (fits in first TCP window).
  - Initial boot JavaScript <= 4 KiB gzipped.
  - Zero render-blocking scripts.
  - Mandatory `width`, `height` (or `aspect-ratio`) on all media.
  - Mandatory `fetchpriority="high"` + `loading="eager"` on the single LCP hero element.
  - `content-visibility: auto` on offscreen sections.
  - Fast-gate enforcement: `scripts/check-perf-budget.mjs` fails if static bundle sizes or DOM node limits regress without an approved ADR.

---

## 11. Resilience by Default (46-State Matrix)

### 11.1 Service Worker Lifecycle, Version Checking & User Reload Semantics
- **Shared CSP Nonce Re-Stamping on Cached HTML Shells (`reference/service-worker.ts`)**:
  - Cached HTML documents must **never** serve stale reused CSP nonces.
  - When the Service Worker falls back to a cached HTML shell during offline navigations, it generates a fresh cryptographic nonce prefixed with `sw-` (`generateSwNonce()`) and rewrites both the `Content-Security-Policy` response header and all `<script nonce="...">` / `<style nonce="...">` attributes in the stream (`rewriteCachedHtmlWithFreshNonce`).
  - Hashed static assets (`/assets/*`, `tokens.css`, `*.js`, `*.css`) use Cache-First; HTML navigations use Network-First with nonce-restamped cache fallback; `/api/*` and `/__admin` use Network-Only.
- **Staged Updates (Never Auto-`skipWaiting()` Over an Active Controller)**:
  - If no active controller exists (`!registration.active`), the Service Worker activates immediately on install for first-load speed.
  - If an active controller already controls the page, the new Service Worker enters the `waiting` state and **never** calls `skipWaiting()` automatically. This prevents breaking in-flight lazy chunk imports or corrupting tab state mid-session.
- **Dual-Signal Version Checking (`reference/sw-updater.ts`)**:
  - **Signal 1 (SW Lifecycle)**: Listens for `registration.onupdatefound` and `state === 'installed'` with an active controller.
  - **Signal 2 (Health Commit Drift)**: Automatically fetches `/health` (`{ cache: 'no-store' }`) on application boot, navigation, and `visibilitychange` (`visible`). If `health.version.commit` differs from the client's loaded commit, detects the drift immediately.
  - Emits `sw:update-available` on the micro-bus (`{ currentCommit, newCommit, source }`).
- **Accessible User Reload Prompt & State Checkpointing**:
  - Displays a non-intrusive, accessible `<output role="status" aria-live="polite">` banner: `"A new version of the app is available. [Reload now] [Later]"`.
  - When the user confirms reload (or dispatches `sw:apply-update`):
    1. Checkpoints non-sensitive form fields (`input`, `textarea`, `select` excluding `type="password"` and `[data-sensitive]`) and scroll position to `sessionStorage` (`checkpointClientStateToSessionStorage`).
    2. Sends `{ type: "SKIP_WAITING" }` to `registration.waiting`.
    3. Listens for `navigator.serviceWorker` `controllerchange` (with a safe timeout fallback) and calls `window.location.reload()`.
    4. Automatically restores form fields and scroll coordinates upon post-reload initialization (`restoreClientStateFromSessionStorage`).
- **Emergency Kill-Switch**:
  - If `/health` returns `killSw: true` (or the client receives `{ type: "KILL_SW" }`), `createSwUpdateManager` and `service-worker.ts` unregister all Service Worker registrations, purge all `caches.keys()`, and emit `sw:killed`.

### 11.2 Font & Asset Resilience
- Zero FOIT/CLS: Use system font stack or `@font-face` with `font-display: swap` and `size-adjust` / `ascent-override` / `descent-override` metric matching.
- Broken image fallback styling.

### 11.3 Crash Recovery & Storage Management
- Checkpoint draft state to `sessionStorage` on debounced input, `visibilitychange` (`hidden`), and `pagehide`.
- Restore state automatically on tab restart or crash recovery.
- Handle `QuotaExceededError` cleanly, shedding non-essential caches when storage limits are approached.

---

## 12. Build Tooling, 3-Tier Testing Infrastructure & Multi-Agent Workflow

### 12.1 Zero-Build / Thin-Build Tooling
- In local development, execute native browser ESM and standard CSS directly.
- Use `wrangler` / `esbuild` / `vite` only for TypeScript type-stripping, edge worker deployment, and content-addressed production bundling.
- Prefer native test runners (`node --test --experimental-strip-types`, `deno test`, or `@cloudflare/vitest-pool-workers`). Avoid complex Babel or Webpack toolchains.

### 12.2 Three-Tier Testing Pyramid
1. **Tier 1: Iterating Unit & Contract Tests (`<= 3s`)**:
   - Single-file execution (`node --test --experimental-strip-types <path>`).
   - Pure in-process logic, hermetic fixtures, temporary directories (`mktemp -d`), zero network calls.
2. **Tier 2: Implementer Fast Gate (`<= 60s`, `bash scripts/fast-gate.sh`)**:
   - Typechecking + linting.
   - `single-owner.mjs` verification.
   - `check-capabilities.mjs` verification against `THREAT_MODEL.md` §3 (covering CSP, Permissions-Policy, OS manifest surfaces, and security .well-known endpoints).
   - `check-perf-budget.mjs` verification against `perf-budget.json`.
   - `check-discovery.mjs` verification (RFC 9116 `security.txt` expiry, `traffic-advice`, `humans.txt`, `robots.txt`, `llms.txt`, and valid `manifest.webmanifest`).
   - **Derived affected test selection** (`scripts/test-selection.mjs`): Scans the static import graph and executes only the unit suites affected by the current Git diff. Fails loudly if a modified source file maps to no test.
3. **Tier 3: Merger Full Gate (`<= 300s`, `bash scripts/full-gate.sh`)**:
   - Executed once by the Merger lane on the merged union before landing to `main`.
   - Runs all unit and integration test suites in parallel processes.
   - Executes real headless browser acceptance tests via Chrome DevTools Protocol (`chrome-devtools-mcp`): asserts CSP blocking of inline scripts, report ingestion, zero console errors, zero layout shifts, and resilience fallbacks.

### 12.3 Multi-Agent Collaboration Rules
- **Task Tracking**: Use Beads (`bd`) as the durable source of truth (`bd ready`, `bd update <id> --claim`, `bd close <id>`).
- **Worktree Isolation**: All feature development occurs in dedicated Git worktrees (`git worktree add --no-track -b <branch> ...`). Never use `git stash` across shared worktrees.
- **Cross-Family Code Review**: Exactly one review per change by a different model family. Verdicts (`PASS`, `PASS-with-notes`, `FAIL`) are pinned to a commit SHA. Maximum 2 review rounds before escalating to coordinator.
- **Landing Message**: The merger records a structured `LAND-SUMMARY` (`WHAT:`, `WHY:`, `EFFECT:`) citing gate verification and closed issue IDs.

---

## 13. Turn-1 Scaffolding Checklist

When bootstrapping a new project, execute these actions on Turn 1:
1. Initialize repository and Git history.
2. If the workspace has not yet been initialized with templates and scripts, run the curl bootstrap command:
   ```bash
   curl -fsSL https://raw.githubusercontent.com/PaulKinlan/default-web-app-prompt/main/install.sh | bash -s -- . "<app-name>"
   ```
   *(If working inside an existing local clone of `default-web-app-prompt`, `bash scripts/bootstrap-web-app.sh . "<app-name>"` works directly).*
3. Record initial decisions in `docs/adr/0000-use-markdown-architectural-decision-records.md` and `docs/adr/0001-baseline-and-architecture.md`.
4. Ask the user for 1-3 sample reference sites (URLs) or reference images/screenshots, analyze them, and record design takeaways in `DESIGN.md`.
5. Copy `perf-budget.json` and set baseline thresholds.
6. Create `tokens.css` with OKLCH light/dark token scales mapped to `DESIGN.md`.
7. Verify `modern-web-guidance` is installed (`npx -y modern-web-guidance@latest install` or `agy plugin install https://github.com/GoogleChrome/modern-web-guidance`).
8. Verify root discovery files in `public/`: `.well-known/security.txt` (RFC 9116), `.well-known/traffic-advice`, `humans.txt`, `robots.txt`, `llms.txt`, and `manifest.webmanifest`.
9. Ensure gate scripts in `scripts/{fast-gate.sh,full-gate.sh,single-owner.mjs,check-capabilities.mjs,check-perf-budget.mjs,check-discovery.mjs,test-selection.mjs}` are executable.
10. Ensure reference modules in `src/lib/{micro-bus.ts,capability-composer.ts,observability.ts,observability-client.ts,sw-updater.ts}` and `public/sw.js` are in place.
11. Scaffold the root HTML shell (`index.html`) with semantic `data-slot` regions, `tokens.css`, manifest/author links, accessible SW update banner slot, and micro-bus initialization.
12. Verify that `bash scripts/fast-gate.sh` passes cleanly (Exit 0).
