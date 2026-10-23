# 0001. Web Platform Baseline, Mergeability Architecture, and Zero-Data-Loss Observability

Date: 2026-10-23
Status: Accepted

## Context
When building web applications with high agent concurrency, the system must:
1. Deliver instant page loads without being weighed down by heavy JavaScript frameworks.
2. Minimize Git merge conflicts across dozens of parallel agents.
3. Prevent privilege escalation and data exfiltration through untrusted output or third-party capabilities.
4. Maintain deep, longitudinal observability across all browser engines with zero data loss over time.

## Decision
1. **Web Platform Baseline**: We target **Baseline Newly Available** as our primary standard. Cutting-edge or browser-specific APIs (such as `navigator.crashReporter` or Built-in AI) are permitted only behind runtime feature detection and graceful fallbacks.
2. **Framework & Client Stack**: We adopt **Vanilla Web Platform / Zero Framework** (Custom Elements / Web Components, native ES modules, and CSS `@layer` & `@scope`). Client-side third-party npm dependencies are forbidden by default.
3. **Multi-Agent Mergeability Architecture**:
   - Features live in self-contained vertical slices (`src/features/<feature-id>/`).
   - Slices are auto-discovered at build/boot time (`.generated/feature-manifest.ts`), requiring zero edits to a central router or registry.
   - Client components communicate exclusively over a typed event/command micro-bus (`src/lib/micro-bus.ts`) and register into semantic shell slots (`data-slot="..."`).
4. **Two-Tier Capability Security**:
   - All HTML responses require a cryptographic nonce CSP without `'unsafe-inline'`, and a default-deny `Permissions-Policy`.
   - Tier 1: First-party capability unlocks are route-scoped to matching paths.
   - Tier 2: Untrusted, user-generated, or LLM-generated output must render in a sandboxed iframe (`sandbox="allow-scripts"`, null origin, `connect-src 'none'`) with a schema-validated `MessageChannel` bridge.
5. **Longitudinal Zero-Data-Loss Observability**:
   - Implement W3C Reporting API, legacy CSP reporting, client `ReportingObserver`, attribute-level CWV + LoAF attribution, and `navigator.crashReporter` breadcrumbs on Day 1.
   - Store events in an append-only log with monotonic sequence cursors, write-time fingerprint deduplication, and permanent per-commit and hourly percentile rollups (`p50`/`p75`/`p95`/`p99`). Never use a lossy ring buffer that silently drops historical evidence.

## Consequences
- Merge conflicts across feature PRs are virtually eliminated.
- Unused features execute zero initial JavaScript, keeping LCP and INP fast by construction.
- Strict CSP and default-deny permissions are enforced from the very first commit.
