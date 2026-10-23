# Default Prompt & Architecture Toolkit for Web Applications

A production-grade prompt and reference toolkit for building modern, high-performance, secure, and resilient web applications with autonomous AI agents.

## Core Philosophy

1. **Baseline Newly Available First**: Leverage the modern web platform (`<dialog>`, Popovers, Invoker Commands, CSS Anchor Positioning, View Transitions, CSS `@layer` & `@scope`, `scheduler.yield()`) with zero client-side npm dependencies by default.
2. **Mergeability by Construction**: Vertical feature slices (`src/features/<id>/`), automatic discovery, `< 1 KB` event/command micro-bus, and slot shell composition so dozens of agents can ship features without Git merge conflicts.
3. **Two-Tier Capability Security**: Strict per-response cryptographic CSP nonces, zero `'unsafe-inline'`, default-deny `Permissions-Policy`, route-scoped capability manifests, and lazy sandboxed iframes for untrusted or LLM-generated outputs.
4. **Longitudinal Observability ("No Excuses")**: Day-1 telemetry including W3C Reporting API, Real-User Core Web Vitals, LoAF attribution, Chrome 145+ `navigator.crashReporter` breadcrumbs, and permanent time-series rollups with zero historical data loss.
5. **Continuous Performance Ratchet**: Critical HTML+CSS <= 14 KiB, boot JS <= 4 KiB, zero render-blocking scripts, and static budget checks in the fast gate.
6. **46-State Web Resilience**: Offline Service Worker with queued mutations, zero-FOIT font metric overrides, state checkpointing for crash recovery, and quota/memory pressure handling.

---

## How to Use

### Option 1: Copy-Paste the Master Prompt (`curl | pbcopy`)
Copy the latest [`PROMPT.md`](PROMPT.md) directly to your clipboard in one command:

```bash
curl -fsSL https://raw.githubusercontent.com/PaulKinlan/default-web-app-prompt/main/PROMPT.md | pbcopy
```

Paste it into your AI agent coding session (Claude Code, Gemini CLI, Antigravity, Cursor, Windsurf, pi, etc.) alongside your application idea:

```markdown
[Pasted PROMPT.md contents]

---
App Idea: Build a collaborative audio recorder and transcription workspace.
```

**How the agent finds the scripts:**
When `PROMPT.md` is pasted, it instructs the agent to automatically execute Turn-1 bootstrapping via GitHub:
```bash
curl -fsSL https://raw.githubusercontent.com/PaulKinlan/default-web-app-prompt/main/install.sh | bash -s -- . "<app-name>"
```
This pulls down all templates, reference modules, and gate scripts directly into the workspace in ~1 second.

---

### Option 2: Bootstrap a Directory Directly via `curl | bash`
Scaffold a fresh project repository pre-configured with all templates, reference modules, and gate scripts without needing to clone first:

```bash
# Bootstrap into current directory:
curl -fsSL https://raw.githubusercontent.com/PaulKinlan/default-web-app-prompt/main/install.sh | bash

# Or specify a target directory and app name:
curl -fsSL https://raw.githubusercontent.com/PaulKinlan/default-web-app-prompt/main/install.sh | bash -s -- ./my-new-app "my-new-app"
```

*(If you have cloned the repository locally, `bash install.sh` or `bash scripts/bootstrap-web-app.sh [target-dir]` works completely offline).*

This sets up:
- `AGENTS.md`, `THREAT_MODEL.md`, and `DESIGN.md`
- `docs/adr/` with initial ADRs
- `docs/design-references/` for user-supplied screenshots and mockups
- `tokens.css` with OKLCH light/dark token palettes mapped to `DESIGN.md`
- `perf-budget.json` performance budgets
- `src/lib/` containing reference micro-bus, capability composer, service worker, and observability modules
- `scripts/` with fast and full gates (`fast-gate.sh`, `full-gate.sh`, `single-owner.mjs`, `check-capabilities.mjs`, `check-perf-budget.mjs`, `check-discovery.mjs`, `test-selection.mjs`)

---

## Directory Layout

```
default-web-app-prompt/
├── PROMPT.md                 # Master copy-pasteable prompt
├── README.md                 # Usage guide & architecture overview
├── install.sh                # One-liner curl bootstrap script
├── templates/                # Drop-in project files
├── PROMPT.md                 # Master copy-pasteable prompt
├── README.md                 # Usage guide & architecture overview
├── templates/                # Drop-in project files
│   ├── AGENTS.md             # Project-specific agent instructions
│   ├── THREAT_MODEL.md       # Capability registry & threat model
│   ├── DESIGN.md             # Aesthetic persona, reference sites/images & token contract
│   ├── tokens.css            # OKLCH semantic design tokens & 10-state styles
│   ├── wrangler.jsonc        # Cloudflare Workers + Static Assets configuration
│   ├── perf-budget.json      # Performance budget configuration
│   ├── public/               # Baseline discovery metadata & manifest
│   │   ├── .well-known/
│   │   │   ├── security.txt  # RFC 9116 security policy with unexpired timestamp
│   │   │   └── traffic-advice# Chrome Private Prefetch Proxy configuration
│   │   ├── humans.txt        # Team attribution & web standards manifest
│   │   ├── robots.txt        # Search & AI crawler policies (GPTBot, ClaudeBot, etc.)
│   │   ├── llms.txt          # Autonomous agent markdown architecture guide
│   │   └── manifest.webmanifest # Rich installable PWA manifest
│   └── docs/
│       ├── adr/              # ADR templates (0000, 0001)
│       └── observability.md  # Observability system documentation
├── reference/                # Zero-dependency reference implementations
│   ├── micro-bus.ts          # < 1 KB typed event/command bus & lazy slice loader
│   ├── capability-composer.ts# Route-scoped CSP, Permissions-Policy, Manifest & .well-known composer
│   ├── service-worker.ts     # SW with fresh 'sw-' CSP nonce re-stamping on cached shells & staged updates
│   ├── sw-updater.ts         # Client SW manager with dual-signal checks, prompt & state checkpointing
│   ├── observability.ts      # Server-side longitudinal observability engine
│   └── observability-client.ts# Client-side ReportingObserver, CWV & crash reporter
├── scripts/                  # Portable gate and check scripts
│   ├── fast-gate.sh          # Implementer fast gate (<= 60s)
│   ├── full-gate.sh          # Merger full gate (<= 300s)
│   ├── single-owner.mjs      # Invariant linter (bans unsafe-inline, hex in components, sleep in tests)
│   ├── check-capabilities.mjs# Audits feature capabilities against THREAT_MODEL.md
│   ├── check-perf-budget.mjs # Static bundle and markup performance checks
│   ├── check-discovery.mjs   # Audits RFC 9116 security.txt, traffic-advice, manifest & robots
│   ├── test-selection.mjs    # Derived affected-test selector from static import graph
│   └── bootstrap-web-app.sh  # Scaffolder for new repositories
└── tests/
    └── default-prompt.test.mjs # Self-test suite verifying the toolkit
```

---

## Running the Self-Tests

Verify the toolkit and reference modules locally:

```bash
node --test --experimental-strip-types tests/default-prompt.test.mjs
bash scripts/fast-gate.sh
```
