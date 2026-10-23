#!/usr/bin/env node
/**
 * scripts/check-capabilities.mjs — Capability Manifest vs THREAT_MODEL.md Auditor
 *
 * Verifies that any feature slice requesting CSP directive widenings,
 * Permissions-Policy unlocks, or BYOK LLM endpoints is registered in
 * Section 3 of THREAT_MODEL.md with an ADR and justification.
 */

import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const threatModelPath = path.join(rootDir, 'THREAT_MODEL.md');
const templatesThreatModel = path.join(rootDir, 'templates', 'THREAT_MODEL.md');

const activeThreatModel = fs.existsSync(threatModelPath)
  ? threatModelPath
  : fs.existsSync(templatesThreatModel)
  ? templatesThreatModel
  : null;

if (!activeThreatModel) {
  console.warn(`[check-capabilities SKIP] No THREAT_MODEL.md found.`);
  process.exit(0);
}

// 1. Parse Section 3 of THREAT_MODEL.md
const tmContent = fs.readFileSync(activeThreatModel, 'utf-8');
const s3Match = tmContent.match(/## 3\.\s*Route-Scoped Capability Registry[\s\S]*?(?=## 4\.|$)/i);
if (!s3Match) {
  console.error(`\x1b[31m[check-capabilities FAIL]\x1b[0m THREAT_MODEL.md is missing Section 3 'Route-Scoped Capability Registry'.`);
  process.exit(1);
}

const s3Text = s3Match[0];
const registryRows = s3Text
  .split('\n')
  .filter((line) => line.trim().startsWith('|') && !line.includes('Feature Slice') && !line.includes('---'))
  .map((line) => {
    const cols = line.split('|').map((c) => c.trim()).filter(Boolean);
    return {
      slice: cols[0] || '',
      route: cols[1] || '',
      csp: cols[2] || '',
      permissions: cols[3] || '',
      adr: cols[4] || '',
      justification: cols[5] || '',
    };
  });

const registeredSlices = new Map(registryRows.map((r) => [r.slice, r]));

// 2. Discover feature capability manifests in src/features/*/capabilities.*
const featuresDir = path.join(rootDir, 'src', 'features');
let violations = 0;

if (fs.existsSync(featuresDir)) {
  const slices = fs.readdirSync(featuresDir, { withFileTypes: true });
  for (const sliceEntry of slices) {
    if (!sliceEntry.isDirectory()) continue;
    const sliceId = sliceEntry.name;
    const capFiles = [
      path.join(featuresDir, sliceId, 'capabilities.ts'),
      path.join(featuresDir, sliceId, 'capabilities.js'),
      path.join(featuresDir, sliceId, 'capabilities.json'),
    ];

    const foundCap = capFiles.find((f) => fs.existsSync(f));
    if (!foundCap) continue;

    const content = fs.readFileSync(foundCap, 'utf-8');
    const hasCsp = content.includes('cspDirectives');
    const hasPerms = content.includes('permissionsPolicy');
    const hasLlm = content.includes('client-byok') || content.includes('generativelanguage') || content.includes('api.openai');
    const hasManifestOs = content.includes('share_target') || content.includes('file_handlers') || content.includes('protocol_handlers');
    const hasWellKnown = content.includes('webauthn') || content.includes('assetLinks') || content.includes('appleAppSiteAssociation');

    if (hasCsp || hasPerms || hasLlm || hasManifestOs || hasWellKnown) {
      const reg = registeredSlices.get(sliceId);
      if (!reg) {
        console.error(`\x1b[31m[check-capabilities FAIL]\x1b[0m Feature slice '${sliceId}' declares capabilities in ${path.relative(rootDir, foundCap)} but has NO entry in THREAT_MODEL.md §3.`);
        violations++;
      } else if (!reg.adr || reg.adr.toLowerCase().includes('todo')) {
        console.error(`\x1b[31m[check-capabilities FAIL]\x1b[0m Feature slice '${sliceId}' in THREAT_MODEL.md §3 is missing an ADR citation.`);
        violations++;
      } else if (!reg.justification || reg.justification.toLowerCase().includes('todo')) {
        console.error(`\x1b[31m[check-capabilities FAIL]\x1b[0m Feature slice '${sliceId}' in THREAT_MODEL.md §3 is missing a justification.`);
        violations++;
      }
    }
  }
}

if (violations > 0) {
  console.error(`\n\x1b[31mCapability audit failed with ${violations} violation(s). Update THREAT_MODEL.md §3 with approved ADRs.\x1b[0m`);
  process.exit(1);
} else {
  console.log(`\x1b[32m[check-capabilities PASS]\x1b[0m All declared capabilities verified against THREAT_MODEL.md.`);
  process.exit(0);
}
