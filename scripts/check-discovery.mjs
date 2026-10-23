#!/usr/bin/env node
/**
 * scripts/check-discovery.mjs — Root Discovery Files & Manifest Auditor
 *
 * Verifies that:
 * 1. /.well-known/security.txt conforms to RFC 9116 with mandatory Contact: and unexpired Expires:.
 * 2. /.well-known/traffic-advice is valid JSON array for Chrome Prefetch Proxy.
 * 3. /humans.txt, /robots.txt, and /llms.txt exist and are non-empty.
 * 4. /manifest.webmanifest is valid JSON with required PWA installability fields.
 */

import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();

// Find public directory (either public/ or templates/public/)
const candidateDirs = [
  path.join(rootDir, 'public'),
  path.join(rootDir, 'templates', 'public'),
];

const targetPublicDir = candidateDirs.find((d) => fs.existsSync(d));

if (!targetPublicDir) {
  console.warn(`[check-discovery SKIP] No public/ or templates/public/ directory found.`);
  process.exit(0);
}

let violations = 0;

function reportViolation(msg) {
  console.error(`\x1b[31m[check-discovery FAIL]\x1b[0m ${msg}`);
  violations++;
}

// 1. Check .well-known/security.txt (RFC 9116)
const secTxtPath = path.join(targetPublicDir, '.well-known', 'security.txt');
if (!fs.existsSync(secTxtPath)) {
  reportViolation(`Missing mandatory security metadata: '${path.relative(rootDir, secTxtPath)}' does not exist.`);
} else {
  const content = fs.readFileSync(secTxtPath, 'utf-8');
  if (!content.includes('Contact:')) {
    reportViolation(`RFC 9116 violation: security.txt is missing required 'Contact:' field.`);
  }

  const expiresMatch = content.match(/^Expires:\s*(.+)$/im);
  if (!expiresMatch) {
    reportViolation(`RFC 9116 violation: security.txt is missing required 'Expires:' timestamp.`);
  } else {
    const expiresStr = expiresMatch[1].trim();
    const expiresTime = Date.parse(expiresStr);
    if (isNaN(expiresTime)) {
      reportViolation(`RFC 9116 violation: security.txt 'Expires:' is not a valid date ('${expiresStr}').`);
    } else if (expiresTime <= Date.now()) {
      reportViolation(`RFC 9116 violation: security.txt has EXPIRED (${new Date(expiresTime).toISOString()}).`);
    }
  }
}

// 2. Check .well-known/traffic-advice
const trafficPath = path.join(targetPublicDir, '.well-known', 'traffic-advice');
if (!fs.existsSync(trafficPath)) {
  reportViolation(`Missing Chrome Prefetch Proxy configuration: '${path.relative(rootDir, trafficPath)}' does not exist.`);
} else {
  try {
    const raw = fs.readFileSync(trafficPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      reportViolation(`traffic-advice must be a non-empty JSON array.`);
    }
  } catch (err) {
    reportViolation(`traffic-advice is not valid JSON: ${err.message}`);
  }
}

// 3. Check humans.txt
const humansPath = path.join(targetPublicDir, 'humans.txt');
if (!fs.existsSync(humansPath) || fs.readFileSync(humansPath, 'utf-8').trim().length === 0) {
  reportViolation(`Missing or empty '${path.relative(rootDir, humansPath)}'.`);
}

// 4. Check robots.txt
const robotsPath = path.join(targetPublicDir, 'robots.txt');
if (!fs.existsSync(robotsPath)) {
  reportViolation(`Missing '${path.relative(rootDir, robotsPath)}'.`);
} else {
  const robotsContent = fs.readFileSync(robotsPath, 'utf-8');
  if (!robotsContent.includes('User-agent:')) {
    reportViolation(`robots.txt must contain at least one 'User-agent:' directive.`);
  }
}

// 5. Check llms.txt
const llmsPath = path.join(targetPublicDir, 'llms.txt');
if (!fs.existsSync(llmsPath) || fs.readFileSync(llmsPath, 'utf-8').trim().length === 0) {
  reportViolation(`Missing or empty '${path.relative(rootDir, llmsPath)}'.`);
}

// 6. Check manifest.webmanifest
const manifestPath = fs.existsSync(path.join(targetPublicDir, 'manifest.webmanifest'))
  ? path.join(targetPublicDir, 'manifest.webmanifest')
  : path.join(targetPublicDir, 'manifest.json');

if (!fs.existsSync(manifestPath)) {
  reportViolation(`Missing Web App Manifest in '${path.relative(rootDir, targetPublicDir)}'.`);
} else {
  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    const requiredKeys = ['name', 'short_name', 'start_url', 'display', 'icons'];
    for (const key of requiredKeys) {
      if (!parsed[key]) {
        reportViolation(`Web App Manifest is missing required installability property '${key}'.`);
      }
    }
    if (Array.isArray(parsed.icons) && parsed.icons.length === 0) {
      reportViolation(`Web App Manifest 'icons' array must not be empty.`);
    }
  } catch (err) {
    reportViolation(`Web App Manifest is not valid JSON: ${err.message}`);
  }
}

// 7. Check DESIGN.md
const designCandidates = [
  path.join(rootDir, 'DESIGN.md'),
  path.join(rootDir, 'templates', 'DESIGN.md'),
];
const activeDesignFile = designCandidates.find((f) => fs.existsSync(f));
if (!activeDesignFile) {
  reportViolation(`Missing mandatory design specification: 'DESIGN.md' does not exist in root.`);
} else {
  const designContent = fs.readFileSync(activeDesignFile, 'utf-8').trim();
  if (designContent.length === 0 || !designContent.includes('DESIGN.md')) {
    reportViolation(`'DESIGN.md' must be a non-empty design system specification.`);
  }
}

if (violations > 0) {
  console.error(`\n\x1b[31mDiscovery audit failed with ${violations} violation(s).\x1b[0m`);
  process.exit(1);
} else {
  console.log(`\x1b[32m[check-discovery PASS]\x1b[0m All discovery files (security.txt, traffic-advice, humans.txt, robots.txt, llms.txt, manifest, DESIGN.md) verified cleanly.`);
  process.exit(0);
}
