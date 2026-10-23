#!/usr/bin/env bash
# scripts/fast-gate.sh — Implementer Fast Gate (Budget: <= 60s)
set -eo pipefail

echo "==> [fast-gate] Starting implementer fast gate..."
START_TIME=$(date +%s)

# 1. Architectural Invariants
echo "--> 1. Running single-owner & architectural invariant checks..."
node scripts/single-owner.mjs

# 2. Capability Security Check
echo "--> 2. Running security capability manifest checks against THREAT_MODEL.md..."
node scripts/check-capabilities.mjs

# 3. Performance Budget Check
echo "--> 3. Running performance budget and markup checks..."
node scripts/check-perf-budget.mjs

# 4. Root Discovery & Web App Manifest Check
echo "--> 4. Running discovery and manifest checks (security.txt, traffic-advice, humans, robots, llms, manifest)..."
node scripts/check-discovery.mjs

# 5. Derived Affected Unit Tests
echo "--> 5. Running affected-only unit tests..."
node scripts/test-selection.mjs

END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))

echo "==> [fast-gate PASS] Gate completed cleanly in ${ELAPSED}s (Budget: <= 60s)."
exit 0
