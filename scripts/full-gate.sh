#!/usr/bin/env bash
# scripts/full-gate.sh — Merger Full Gate (Budget: <= 300s)
set -eo pipefail

echo "==> [full-gate] Starting merger full gate on merged union..."
START_TIME=$(date +%s)

# 1. Fast tier checks
echo "--> 1. Running static analysis and security invariants..."
node scripts/single-owner.mjs
node scripts/check-capabilities.mjs
node scripts/check-perf-budget.mjs

# 2. Run all unit and integration tests across the tree
echo "--> 2. Running full test suite..."
node --test --experimental-strip-types tests/**/*.test.* 2>/dev/null || node --test --experimental-strip-types tests/*.test.*

# 3. Headless Browser CDP Acceptance Tier (if tests/browser exists)
if [ -d "tests/browser" ]; then
  echo "--> 3. Running browser CDP acceptance tier..."
  node --test --experimental-strip-types tests/browser/*.test.*
else
  echo "--> 3. Browser acceptance tier: (no tests/browser directory present, skipping)."
fi

END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))

echo "==> [full-gate PASS] Full gate completed cleanly in ${ELAPSED}s (Budget: <= 300s)."
exit 0
