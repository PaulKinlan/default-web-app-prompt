# 0000. Use Markdown Architectural Decision Records

Date: 2026-10-23
Status: Accepted

## Context
Architectural decisions that live only in conversational chat sessions, PR comments, or commit messages are quickly lost when multiple autonomous agents collaborate. Future agents re-derive, contradict, or silently weaken past architectural invariants.

## Decision
We will record all significant architectural and security decisions using lightweight Markdown Architectural Decision Records (ADRs) kept in `docs/adr/`. Each ADR defines:
- **Context**: The problem, forces, and constraints.
- **Decision**: The chosen design and contract.
- **Consequences**: What becomes easier, what becomes harder, and what trade-offs were accepted.
- **Alternatives Considered**: Options rejected and why.

Decisions are numbered monotonically (`0000`, `0001`, `0002`). A decision is never edited in place to change its meaning; if a decision changes, a new superseding ADR is written and marked as superseding the previous one.

## Consequences
- Every autonomous agent can understand *why* an invariant exists without guessing.
- Automated gates (e.g. `check-capabilities.mjs`) can verify that capability widenings cite a valid ADR.
