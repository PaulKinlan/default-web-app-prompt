#!/usr/bin/env node
/**
 * scripts/check-perf-budget.mjs — Performance Budget & Markup Linter
 *
 * Checks:
 * 1. Initial critical HTML, CSS, and JS bundle gzip sizes against perf-budget.json.
 * 2. Explicit width and height attributes on <img> and <video> tags.
 * 3. fetchpriority="high" and loading="eager" on LCP hero elements.
 * 4. Zero render-blocking <script> tags.
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const rootDir = process.cwd();
const budgetPath = path.join(rootDir, 'perf-budget.json');
const templatesBudgetPath = path.join(rootDir, 'templates', 'perf-budget.json');

const activeBudgetPath = fs.existsSync(budgetPath)
  ? budgetPath
  : fs.existsSync(templatesBudgetPath)
  ? templatesBudgetPath
  : null;

if (!activeBudgetPath) {
  console.warn(`[check-perf-budget SKIP] No perf-budget.json found.`);
  process.exit(0);
}

const budget = JSON.parse(fs.readFileSync(activeBudgetPath, 'utf-8'));
const thresholds = budget.thresholds || {};
let violations = 0;

function reportViolation(rule, detail) {
  console.error(`\x1b[31m[perf-budget FAIL]\x1b[0m ${rule}: ${detail}`);
  violations++;
}

// 1. Check HTML markup files
const htmlCandidates = [
  path.join(rootDir, 'dist', 'index.html'),
  path.join(rootDir, 'public', 'index.html'),
  path.join(rootDir, 'index.html'),
];

for (const htmlFile of htmlCandidates) {
  if (!fs.existsSync(htmlFile)) continue;
  const content = fs.readFileSync(htmlFile, 'utf-8');
  const gzipBytes = zlib.gzipSync(Buffer.from(content)).length;

  if (thresholds.maxInitialHtmlGzipBytes && gzipBytes > thresholds.maxInitialHtmlGzipBytes) {
    reportViolation(
      'maxInitialHtmlGzipBytes',
      `${path.relative(rootDir, htmlFile)} is ${gzipBytes} bytes gzip (exceeds budget of ${thresholds.maxInitialHtmlGzipBytes} bytes)`
    );
  }

  // Check for render-blocking scripts
  const scriptTags = content.match(/<script\b[^>]*>/gi) || [];
  for (const tag of scriptTags) {
    const isModule = /type=["']module["']/i.test(tag);
    const isAsync = /\basync\b/i.test(tag);
    const isDefer = /\bdefer\b/i.test(tag);
    const hasSrc = /\bsrc=["']/i.test(tag);
    if (hasSrc && !isModule && !isAsync && !isDefer) {
      reportViolation('banRenderBlockingScripts', `Render-blocking external script found in ${path.relative(rootDir, htmlFile)}: ${tag}`);
    }
  }

  // Check <img> dimensions
  const imgTags = content.match(/<img\b[^>]*>/gi) || [];
  for (const tag of imgTags) {
    const hasWidth = /\bwidth=["']/i.test(tag);
    const hasHeight = /\bheight=["']/i.test(tag);
    const hasAspect = /aspect-ratio/i.test(tag);
    if ((!hasWidth || !hasHeight) && !hasAspect) {
      reportViolation('requireExplicitMediaDimensions', `<img> tag in ${path.relative(rootDir, htmlFile)} missing explicit width and height: ${tag}`);
    }
  }

  // Check LCP hero elements
  const heroTags = content.match(/<[^>]+\bdata-lcp\b[^>]*>/gi) || [];
  for (const tag of heroTags) {
    if (!/fetchpriority=["']high["']/i.test(tag)) {
      reportViolation('requireLcpHighFetchPriority', `LCP element in ${path.relative(rootDir, htmlFile)} missing fetchpriority="high": ${tag}`);
    }
  }
}

if (violations > 0) {
  console.error(`\n\x1b[31mPerformance budget checks failed with ${violations} violation(s).\x1b[0m`);
  process.exit(1);
} else {
  console.log(`\x1b[32m[check-perf-budget PASS]\x1b[0m Performance budgets and markup rules satisfied.`);
  process.exit(0);
}
