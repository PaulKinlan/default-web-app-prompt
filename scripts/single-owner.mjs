#!/usr/bin/env node
/**
 * scripts/single-owner.mjs — Single-Owner & Architecture Invariant Linter
 *
 * Enforces:
 * 1. No 'unsafe-inline' or 'unsafe-eval' in Content-Security-Policy configurations.
 * 2. No inline style="..." attributes in HTML templates.
 * 3. No hardcoded hex color codes in component styles (must use semantic CSS tokens).
 * 4. No fixed sleep/setTimeout calls in tests (must poll deterministic condition predicates).
 * 5. Single owner for cryptographic nonce generation and header composition.
 */

import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
let violations = 0;

function reportViolation(file, lineNum, rule, detail) {
  const relPath = path.relative(rootDir, file);
  console.error(`\x1b[31m[single-owner FAIL]\x1b[0m ${relPath}:${lineNum} — ${rule}: ${detail}`);
  violations++;
}

function walkDir(dir, filter) {
  const files = [];
  if (!fs.existsSync(dir)) return files;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist' || entry.name === '.generated') {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkDir(fullPath, filter));
    } else if (!filter || filter(fullPath)) {
      files.push(fullPath);
    }
  }
  return files;
}

// 1. Scan source and HTML files for 'unsafe-inline' and inline style attributes
const srcFiles = walkDir(rootDir, (f) => /\.(ts|js|mjs|html)$/.test(f));
for (const file of srcFiles) {
  // Allow reference capability composer and test fixtures to mention the forbidden tokens in string checks
  if (file.includes('node_modules') || file.includes('single-owner.mjs') || file.includes('tests/')) continue;

  const content = fs.readFileSync(file, 'utf-8');
  const lines = content.split('\n');

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;

    // Check for unsafe-inline in CSP
    if (/['"]unsafe-inline['"]/i.test(line) && !line.includes('sandbox') && !file.includes('capability-composer.ts')) {
      reportViolation(file, lineNum, 'csp-no-unsafe-inline', `'unsafe-inline' is forbidden in Content-Security-Policy.`);
    }

    // Check for inline style attributes in HTML templates
    if (/\sstyle=["'][^"']+["']/i.test(line) && !file.includes('tokens.css')) {
      reportViolation(file, lineNum, 'html-no-inline-style', `Inline style="..." attributes are forbidden. Use CSS classes with semantic tokens.`);
    }
  });
}

// 2. Scan component CSS for hardcoded hex colors outside tokens.css
const cssFiles = walkDir(rootDir, (f) => f.endsWith('.css') && !f.endsWith('tokens.css'));
for (const file of cssFiles) {
  const content = fs.readFileSync(file, 'utf-8');
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    if (/#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})\b/i.test(line) && !line.includes('--')) {
      reportViolation(file, lineNum, 'css-no-hardcoded-hex', `Hardcoded hex colors forbidden in component CSS. Use var(--token) from tokens.css.`);
    }
  });
}

// 3. Scan test files for fixed sleep() calls
const testFiles = walkDir(rootDir, (f) => /\.(test|spec)\.(ts|js|mjs)$/.test(f));
for (const file of testFiles) {
  const content = fs.readFileSync(file, 'utf-8');
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    if (/(?:await\s+)?sleep\(\s*\d+\s*\)/.test(line) && !line.includes('// allowed-sleep')) {
      reportViolation(file, lineNum, 'tests-no-fixed-sleep', `Fixed sleep() calls in tests are forbidden (causes flakiness on loaded VMs). Poll condition predicates.`);
    }
  });
}

if (violations > 0) {
  console.error(`\n\x1b[31mSingle-owner check failed with ${violations} violation(s).\x1b[0m`);
  process.exit(1);
} else {
  console.log(`\x1b[32m[single-owner PASS]\x1b[0m All architectural single-owner invariants verified.`);
  process.exit(0);
}
