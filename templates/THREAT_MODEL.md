# THREAT_MODEL.md — {{PROJECT_NAME}}

> **Status: Active.** This document defines the security boundaries, assets, and route-scoped capabilities of the application.
> The fast-gate script (`scripts/check-capabilities.mjs`) parses Section 3 to ensure zero undocumented capability creep.

---

## 1. Protected Assets

| Asset | Why It Matters | Where It Lives | Defense |
|---|---|---|---|
| User credentials / Auth sessions | Account takeover risk | `HttpOnly; SameSite=Strict; Secure` cookies, memory | Session token hashing, CSRF protection, constant-time verification |
| Private user data & telemetry | Confidentiality / privacy violation | Persistent storage (D1 / SQLite / KV) | Route authorization, tenant isolation, secret redaction |
| API keys & remote credentials | Infrastructure compromise / cost runaway | Server environment variables only | Zero raw secrets in client bundles or prompts; CredentialBroker proxy |
| DOM execution context | Client-side code injection (XSS) | Browser renderer process | Per-response CSP nonce, zero `'unsafe-inline'`, Trusted Types |

---

## 2. Trust Boundaries

| # | Boundary | From (Untrusted) | To (Trusted) | Security Enforcement |
|---|---|---|---|---|
| 1 | Public HTTP routes | Unauthenticated browser / client | App router | Strict rate-limiting, bounded body reading (<= 64 KiB), schema validation |
| 2 | Observability report sink | Public browser reporting beacon | Report store | Bounded stream reader, prototype-pollution stripping, secret redaction, fingerprint deduplication |
| 3 | Untrusted / LLM HTML output | LLM generation / user markup | Browser DOM | Isolated sandboxed iframe (`sandbox="allow-scripts"`, null origin, `connect-src 'none'`) |
| 4 | Sandboxed iframe bridge | Untrusted iframe context | Main application bus | Schema-validated `MessageChannel` port, explicit `event.origin` and `event.source` checks |

---

## 3. Route-Scoped Capability Registry

Every feature slice requesting CSP directive widenings, `Permissions-Policy` feature unlocks, BYOK LLM endpoints, OS-level Manifest integration (`share_target`, `file_handlers`, `protocol_handlers`), or conditional `.well-known` endpoints (`webauthn`, `assetlinks`, `appleAppSiteAssociation`) **must** have an entry in this table. The fast gate verifies this automatically.

| Feature Slice | Route Pattern | CSP Directives | Permissions-Policy | ADR | Justification |
|---|---|---|---|---|---|
| base-app | `/*` | `default-src 'self'; script-src 'self' 'nonce-{nonce}' 'strict-dynamic'; style-src 'self' 'nonce-{nonce}'; img-src 'self' data: https:; media-src 'self' blob: https:; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'` | *(all disabled)* | 0001 | Baseline zero-trust default-deny security policy for all routes |

---

## 4. Sandboxed Iframe & Untrusted Output Inventory

| Surface | Purpose | Sandbox Attribute | CSP Enforcement | Allowed Permissions | Communication Bridge |
|---|---|---|---|---|---|
| LLM artifact preview | Rendering generative HTML/JS | `sandbox="allow-scripts"` | `default-src 'none'; script-src 'unsafe-inline' blob:; style-src 'unsafe-inline'; connect-src 'none'` | `none` | Schema-validated `MessageChannel` port |

---

## 5. LLM Integration & Credential Broker Policy

- **Zero Client-Side Secrets**: Remote LLM provider API keys (`GEMINI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`) must never be sent to the browser or embedded in client bundles.
- **Server Proxy**: All remote model queries must pass through a server-side route handler or `CredentialBroker` (`connect-src 'self'`).
- **Client BYOK Exception**: Direct client-side calls to LLM domains (e.g. `https://generativelanguage.googleapis.com`) are allowed only for explicitly documented BYOK features, require an approved ADR, and must be registered in Section 3 above.
