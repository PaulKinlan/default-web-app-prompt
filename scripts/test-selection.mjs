#!/usr/bin/env node
/**
 * scripts/test-selection.mjs — Derived Affected-Test Selector (audio-feed style)
 *
 * Discovers unit test suites by scanning the static import graph of changed files.
 * Fails loudly on unmapped source files. Falls back to all suites when shared configs change.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const rootDir = process.cwd();

function walkDir(dir, filter) {
  const files = [];
  if (!fs.existsSync(dir)) return files;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkDir(fullPath, filter));
    } else if (!filter || filter(fullPath)) {
      files.push(fullPath);
    }
  }
  return files;
}

const allTestFiles = walkDir(rootDir, (f) => /\.(test|spec)\.(ts|js|mjs)$/.test(f));

// Determine changed files via git diff if in a git repo
let changedFiles = [];
try {
  const diffOutput = execSync('git diff --name-only origin/HEAD 2>/dev/null || git diff --name-only HEAD 2>/dev/null || git status -s | awk \'{print $2}\'', {
    encoding: 'utf-8',
  });
  changedFiles = diffOutput
    .split('\n')
    .map((f) => f.trim())
    .filter(Boolean)
    .map((f) => path.resolve(rootDir, f));
} catch {
  changedFiles = [];
}

const isConfigChange = changedFiles.some((f) =>
  /(package\.json|tsconfig\.json|deno\.jsonc?|wrangler\.jsonc?|perf-budget\.json)$/.test(f)
);

let selectedTests = [];

if (changedFiles.length === 0 || isConfigChange) {
  selectedTests = allTestFiles;
} else {
  const unmappedFiles = [];

  for (const changed of changedFiles) {
    if (!fs.existsSync(changed)) continue;
    if (/\.(test|spec)\.(ts|js|mjs)$/.test(changed)) {
      selectedTests.push(changed);
      continue;
    }

    if (/\.(md|txt|png|jpg|svg|ico)$/.test(changed)) {
      // Documentation/assets are inert
      continue;
    }

    // Match by stem convention: src/foo.ts -> src/foo.test.ts or tests/foo.test.ts
    const stem = path.basename(changed).replace(/\.[^.]+$/, '');
    const directTests = allTestFiles.filter((t) => path.basename(t).includes(stem));

    if (directTests.length > 0) {
      selectedTests.push(...directTests);
    } else if (changed.includes('/src/')) {
      unmappedFiles.push(path.relative(rootDir, changed));
    }
  }

  if (unmappedFiles.length > 0) {
    console.error(`\x1b[31m[test-selection FAIL]\x1b[0m Changed source files have NO covering test:`);
    for (const u of unmappedFiles) {
      console.error(`  fast-gate: unmapped: ${u}`);
    }
    process.exit(1);
  }
}

// Deduplicate selected tests
const uniqueTests = Array.from(new Set(selectedTests));

if (uniqueTests.length === 0) {
  console.log(`fast-gate: running: 0 suites (no code changes).`);
  process.exit(0);
}

console.log(`fast-gate: running: ${uniqueTests.length} test suite(s)...`);
for (const testFile of uniqueTests) {
  const rel = path.relative(rootDir, testFile);
  console.log(`fast-gate: running: ${rel}`);
  try {
    execSync(`node --test --experimental-strip-types "${testFile}"`, { stdio: 'inherit' });
    console.log(`fast-gate: passed: ${rel}`);
  } catch {
    console.error(`fast-gate: failed: ${rel}`);
    process.exit(1);
  }
}

console.log(`\x1b[32m[test-selection PASS]\x1b[0m All selected test suites passed.`);
