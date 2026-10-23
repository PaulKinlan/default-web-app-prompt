# DESIGN.md — {{PROJECT_NAME}}

> **Design Specification & Visual System Contract**
> This document establishes the aesthetic persona, design references, typography, spatial layout, and component state rules for {{PROJECT_NAME}}.
> All agents working on UI slices **must** adhere strictly to the guidelines and tokens defined here.

---

## 1. Aesthetic Direction & Reference Inspirations

### 1.1 Aesthetic Persona
- **Visual Identity**: High-craft technical ergonomics with deliberate whitespace, crisp contrast, and tactile feedback.
- **Copy & Tone**: Plain, direct, non-anthropomorphic technical language. No conversational fluff or generic marketing copy.
- **Anti-Slop Guarantees**:
  - NO generic SaaS purple/indigo gradient backgrounds.
  - NO unstyled white card grids with fuzzy drop-shadows.
  - NO arbitrary border radii or inconsistent spacing multipliers.
  - NO decorative illustrations or placeholder stock graphics without utility.

### 1.2 Reference Sites & Sample URLs
Ask the user at kickoff to supply reference websites for design inspiration. Document what to adopt and what to avoid:

| Reference Site / URL | What to Draw From (Typography, Layout, Motion) | What to Avoid |
|---|---|---|
| *e.g. https://linear.app* | Dense, keyboard-first information hierarchy, crisp 1px borders | Heavy dark-mode saturation |
| *e.g. https://motherduck.com* | Warm, readable typography, clear callouts | Complex multi-tier navigation |
| *(user-supplied)* | *(key strengths observed)* | *(patterns to avoid)* |

### 1.3 Reference Images & Screenshots
When the user provides design screenshots, mockups, or reference images, store them in `docs/design-references/` and record the visual takeaways:

| Asset Path | Key Visual Elements | Applied Tokens / Layout |
|---|---|---|
| `docs/design-references/hero-reference.png` | Asymmetric 2-column split, high-contrast monospace badge | `--font-mono`, `--space-lg` hero grid |
| *(user-supplied screenshot)* | *(observed styling/palette)* | *(mapped CSS token)* |

---

## 2. Color System & Atmospheric Polarity (`@layer tokens`)

All color values live exclusively in `public/tokens.css` inside `@layer tokens` using perceptual **OKLCH** and native `light-dark()`. Component CSS must reference semantic custom properties (`var(--token)`); hardcoded hex codes or RGB literals are strictly forbidden.

| Semantic Token | Light Mode Value | Dark Mode Value | Purpose / Role | WCAG AA Contrast |
|---|---|---|---|---|
| `--bg` | `oklch(98% 0.005 240)` | `oklch(14% 0.01 240)` | Root canvas background | Base |
| `--fg` | `oklch(18% 0.02 240)` | `oklch(95% 0.005 240)` | Primary readable copy | >= 12:1 against `--bg` |
| `--card` | `oklch(100% 0 0)` | `oklch(18% 0.015 240)` | Raised card and panel surfaces | Elevated contrast |
| `--line` | `oklch(88% 0.01 240)` | `oklch(28% 0.02 240)` | Subtle structural borders (1px) | >= 3:1 against `--bg` |
| `--muted` | `oklch(45% 0.02 240)` | `oklch(70% 0.01 240)` | Secondary labels & captions | >= 4.5:1 against `--bg` |
| `--accent` | `oklch(55% 0.22 255)` | `oklch(72% 0.18 255)` | Primary brand & active actions | Primary CTA |
| `--ok` | `oklch(52% 0.18 145)` | `oklch(72% 0.18 145)` | Success badges & verified status | Success |
| `--warn` | `oklch(62% 0.18 65)` | `oklch(78% 0.16 65)` | Warning alerts & pending states | Warning |
| `--bad` | `oklch(52% 0.22 25)` | `oklch(70% 0.20 25)` | Errors & destructive actions | Error / Destructive |
| `--focus-ring` | `oklch(50% 0.24 255)` | `oklch(75% 0.20 255)` | Keyboard focus outline (`3px`) | High visibility |

---

## 3. Typography & Scannable Hierarchy

- **System Font Stacks (Zero FOIT)**:
  - Body: `system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
  - Monospace: `ui-monospace, 'SF Mono', Menlo, Monaco, Consolas, monospace`
- **Fluid Type Scale**:
  - Small / Caption: `--text-sm = clamp(0.8125rem, 0.8rem + 0.1vw, 0.875rem)`
  - Body: `--text-base = clamp(0.9375rem, 0.9rem + 0.2vw, 1.0625rem)`
  - Subheading: `--text-lg = clamp(1.25rem, 1.15rem + 0.5vw, 1.5rem)`
  - Section Heading: `--text-xl = clamp(1.75rem, 1.5rem + 1vw, 2.25rem)`
- **Measure & Line Length**:
  - Prose paragraphs must be bounded to `60ch`–`75ch` (`max-width: 68ch`).
- **Tabular Numerals**:
  - Apply `font-variant-numeric: tabular-nums` to all counters, timers, financial figures, data tables, and metrics to prevent layout wobble.

---

## 4. Layout Architecture & Spatial Geometry

- **Semantic Shell Slots**:
  - Views mount into predetermined slots in `index.html`: `data-slot="header"`, `data-slot="main"`, `data-slot="sidebar"`, `data-slot="modals"`, `data-slot="footer"`.
- **CSS Grid & Container Queries**:
  - Use `@container` for component-level responsive layouts rather than global viewport media queries where possible.
- **Visual Focus (1 Primary Action)**:
  - Every view must have exactly one primary call-to-action button styled with `--accent`. Secondary actions use ghost or outline treatments.
- **Scroll Ergonomics**:
  - Modals, drawers, and popovers must use `overscroll-behavior: contain` to prevent background scroll-jacking.

---

## 5. The 10-State UI Completeness & Motion Specification

Every user-facing interactive component must explicitly handle and style all 10 states:

1. **Default**: Resting state with clear affordances.
2. **Hover**: Smooth pointer highlight (subtle lightness shift <= 100ms).
3. **`:focus-visible`**: Mandatory `3px` solid `--focus-ring` with `outline-offset: 2px` (never `outline: none`).
4. **Active / Pressed**: Immediate tactile feedback (transform `scale(0.98)` or deeper background).
5. **Disabled**: `aria-disabled="true"`, reduced opacity (`0.5`), `cursor: not-allowed`, pointer events suppressed.
6. **Loading**: Content skeletons for asynchronous actions > 300ms, with `aria-busy="true"`.
7. **Empty**: Explains what was expected, confirms zero records found, and provides an immediate next action button.
8. **Error**: Accessible error banner with actionable recovery guidance and specific error codes (no raw stack traces).
9. **Offline / Stale**: Indicator displaying cached state, last synchronization timestamp, and queued mutation count.
10. **Dark / Light Mode**: Handled natively via `light-dark()` in `tokens.css`.

- **Entry & Exit Motion**:
  - Use native `@starting-style` and `transition-behavior: allow-discrete` for zero-JS top-layer entry/exit animations on `<dialog>` and `[popover]`.
  - Wrap all transitions in `@media (prefers-reduced-motion: no-preference)`.
