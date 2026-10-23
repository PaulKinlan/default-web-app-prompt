# Agent Instructions — {{PROJECT_NAME}}

> This document defines the non-negotiable architectural constraints, security rules, and development workflows for this repository. Every lane and autonomous agent must follow this specification.

---

## 1. Standing Priorities

Every plan, code change, and code review must prioritize:
1. **Performance**: Initial paint <= 14 KiB, zero render-blocking scripts, INP <= 50ms, fast gates <= 60s.
2. **Security & Privacy**: Enforced cryptographic CSP nonces, zero `'unsafe-inline'`, default-deny `Permissions-Policy`, route-scoped capabilities, sandboxed iframes for untrusted output.
3. **Resilience & Observability**: Day-1 W3C Reporting API, Real-User CWV + LoAF attribution, `navigator.crashReporter` breadcrumbs, longitudinal zero-data-loss storage.
4. **Mergeability**: Vertical feature slices (`src/features/<id>/`), auto-discovery, event/command micro-bus, slot shell composition, derived affected-test selection.
5. **Design, UI & Accessibility**: High visual craft, OKLCH tokens in `@layer tokens`, 10-state UI completeness, WCAG 2.1 AA.
6. **Features**: Built on narrow interfaces and single-owner seams.

---

## 2. Mandatory Skill Loop (Run on Every Turn/Build)

- **Frontend HTML/CSS/JS Tasks — modern-web-guidance**:
  - The `modern-web-guidance` project **must be installed and queried** before implementing any frontend feature or UI component.
  - If not already available as an agent skill, install it via:
    ```bash
    npx -y modern-web-guidance@latest install
    # or in Antigravity: agy plugin install https://github.com/GoogleChrome/modern-web-guidance
    ```
  - Before writing component code, run:
    ```bash
    npx -y modern-web-guidance@latest search "<feature-or-layout-goal>"
    npx -y modern-web-guidance@latest retrieve "<guide-id>"
    ```
  - Prioritize native Baseline Newly Available primitives; zero client-side npm dependencies without an approved ADR.
- **Debugging**: Use `chrome-devtools-mcp` (`chrome-devtools` skill). Never rely on curl or unverified guesses for client-side behavior.
- **Accessibility**: Run `a11y-debugging` on every view (verify semantic HTML, 3px `:focus-visible` ring, `>= 24x24px` tap targets, WCAG AA contrast).
- **Performance**: Run `debug-optimize-lcp` whenever modifying views or assets.
- **Milestone Completion**: Run `web-resilience-audit` and `web-resilience-fix` before closing any user-facing milestone.

---

## 3. Design System Contract (`DESIGN.md` & `public/tokens.css`)

- Every agent touching UI **must** read and follow `DESIGN.md` and `public/tokens.css`.
- **Reference Sites & Visual Guidance**: Inspect user-supplied reference sites and mockups in `docs/design-references/` to match visual density, layout structure, and token hierarchy.
- **Zero Hardcoded Values**: Always use semantic tokens (`var(--bg)`, `var(--card)`, `var(--line)`, `var(--accent)`, `var(--focus-ring)`). Hardcoded hex or RGB values in component CSS are forbidden and caught by static linting.
- **10-State UI Completeness**: Every interactive component must handle: `default`, `hover`, `:focus-visible` (mandatory `3px` solid ring with `2px` offset), `active`, `disabled`, `loading` (`aria-busy="true"`), `empty`, `error`, `offline/stale`, and `dark/light` mode via `light-dark()`.
- **Ban AI Slop**: No generic purple/indigo gradient backgrounds, no unstyled white card grids, no conversational filler copy in technical UIs.

---

## 4. Architecture & Vertical Feature Slices

All feature work is encapsulated inside `src/features/<feature-id>/`:
```
src/features/<feature-id>/
  ├── routes.ts         # Standard WinterCG fetch handlers
  ├── ui.ts             # Web Component definitions and rendering logic
  ├── styles.css        # Scoped styles (@scope or @layer components)
  ├── capabilities.ts   # Declarative security capability manifest
  └── <feature-id>.test.ts # Scoped unit tests
```

- **Zero Central Edits**: Never import feature files into a central router, CSP file, or `index.html`. Feature discovery is automatic via `scripts/build-manifest.ts` into `.generated/feature-manifest.ts`.
- **Micro-Bus**: Inter-component communication must go through `src/lib/micro-bus.ts`. Components must not import each other.
- **Slots**: Views declare target regions (`data-slot="header|main|sidebar|modals|footer"`) and mount declaratively.

---

## 5. Security & Capabilities Gate

- All HTML responses require a fresh cryptographic nonce (`script-src 'self' 'nonce-...'`, `style-src 'self' 'nonce-...'`).
- No `'unsafe-inline'`, no `'unsafe-eval'`, and no inline `style="..."` attributes.
- Default-deny `Permissions-Policy` disabled for all powerful APIs by default.
- If a slice requires capabilities (e.g. `microphone=(self)` or a client-byok LLM `connect-src`), it must declare them in `capabilities.ts`.
- **Enforcement**: `scripts/check-capabilities.mjs` runs in the fast gate. Any capability widening (CSP, Permissions-Policy, OS manifest surfaces, or conditional .well-known endpoints) not registered in `THREAT_MODEL.md` §3 with an ADR will immediately fail the gate.
- `scripts/check-discovery.mjs` verifies `/.well-known/security.txt` (RFC 9116 with unexpired timestamp), `/.well-known/traffic-advice`, `humans.txt`, `robots.txt`, `llms.txt`, and `manifest.webmanifest`.
- Any untrusted, user-generated, or LLM-generated output must render inside a lazy `<iframe sandbox="allow-scripts">` served under a null origin with `connect-src 'none'`.
- Service Workers must never auto-skipWaiting over an active controller; version updates must be staged, announced via the micro-bus (`sw:update-available`), and prompted with state-preserving reload (`sessionStorage` checkpointing). Cached HTML shells must re-stamp fresh SW-scoped CSP nonces.

---

## 6. Testing & Quality Gates

### 5.1 Three-Tier Testing
1. **Iterating**: `node --test --experimental-strip-types <test-file>` (target <= 3s).
2. **Implementer Fast Gate**: `bash scripts/fast-gate.sh` (must be <= 60s). Runs `tsc`, linter, `single-owner.mjs`, `check-capabilities.mjs`, `check-perf-budget.mjs`, and derived affected unit tests via `scripts/test-selection.mjs`.
3. **Merger Full Gate**: `bash scripts/full-gate.sh` (<= 300s). Runs all unit and integration tests plus headless Chrome CDP browser acceptance tests.

### 5.2 Three Forbidden Gate Pathologies
- **P1 (Shared Mutable State)**: Never point tests at shared files (`$HOME`, fixed ports, fixed `/tmp` paths). Always use hermetic temporary directories (`mktemp -d`).
- **P2 (Order Dependence)**: Tests must be isolated and runnable in random order.
- **P3 (Wall-Clock Assertions)**: Never assert on elapsed wall-clock time or sleep fixed durations (`sleep(2000)`). Poll deterministic predicates.

---

## 7. Multi-Agent Workflow (Beads & Worktrees)

- **Task Tracking**: Use Beads (`bd`) for all task tracking (`bd ready`, `bd update <id> --claim`, `bd close <id>`).
- **Worktree Isolation**: All feature development must occur in isolated Git worktrees (`git worktree add --no-track -b <branch> ...`). Never share worktrees or run `git stash`.
- **One Cross-Family Review**: Every change requires exactly one review by a different model family pinned to a commit SHA. Maximum 2 review rounds before escalating to coordinator.
- **Landing Message**: Merger records a structured `LAND-SUMMARY` (`WHAT:`, `WHY:`, `EFFECT:`) citing gate verification and closed issue IDs.
