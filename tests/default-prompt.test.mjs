/**
 * tests/default-prompt.test.mjs — Comprehensive Self-Test Suite for Default Prompt Toolkit
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';

const rootDir = process.cwd();

test('1. PROMPT.md completeness and authority check', () => {
  const promptPath = path.join(rootDir, 'PROMPT.md');
  assert.ok(fs.existsSync(promptPath), 'PROMPT.md must exist in root');

  const content = fs.readFileSync(promptPath, 'utf-8');

  // Verify core sections and keywords
  const requiredKeywords = [
    'Baseline Newly Available',
    'modern-web-guidance',
    'chrome-devtools-mcp',
    'a11y-debugging',
    'debug-optimize-lcp',
    'web-resilience-audit',
    'Vanilla Web Platform',
    'Cloudflare',
    'WinterCG',
    'tokens.css',
    'OKLCH',
    ':focus-visible',
    'tabular-nums',
    'overscroll-behavior',
    '10-State UI Completeness Matrix',
    'Vertical Feature Slices',
    'micro-bus',
    'data-slot',
    'Content-Security-Policy',
    'Permissions-Policy',
    'nonce',
    'sandbox="allow-scripts"',
    'Reporting API',
    'navigator.crashReporter',
    'Long Animation Frames',
    'perf-budget.json',
    'single-owner',
    'check-capabilities',
    'check-discovery',
    'fast-gate.sh',
    'full-gate.sh',
    'security.txt',
    'traffic-advice',
    'humans.txt',
    'robots.txt',
    'llms.txt',
    'manifest.webmanifest',
    'SKIP_WAITING',
    'rewriteCachedHtmlWithFreshNonce',
    'DESIGN.md',
    'sample websites',
    'reference images',
    'npx -y modern-web-guidance@latest',
    'GoogleChrome/modern-web-guidance',
    'https://raw.githubusercontent.com/PaulKinlan/default-web-app-prompt/main/install.sh',
    'pbcopy',
  ];

  for (const kw of requiredKeywords) {
    assert.ok(content.includes(kw), `PROMPT.md must contain '${kw}'`);
  }

  // Verify templates/AGENTS.md has modern-web-guidance and DESIGN.md instructions
  const agentsPath = path.join(rootDir, 'templates', 'AGENTS.md');
  assert.ok(fs.existsSync(agentsPath), 'templates/AGENTS.md must exist');
  const agentsContent = fs.readFileSync(agentsPath, 'utf-8');
  assert.ok(agentsContent.includes('modern-web-guidance@latest'));
  assert.ok(agentsContent.includes('DESIGN.md'));

  // Verify templates/DESIGN.md exists and has reference tables
  const designPath = path.join(rootDir, 'templates', 'DESIGN.md');
  assert.ok(fs.existsSync(designPath), 'templates/DESIGN.md must exist');
  const designContent = fs.readFileSync(designPath, 'utf-8');
  assert.ok(designContent.includes('Reference Sites'));
  assert.ok(designContent.includes('Reference Images'));
});

test('2. reference/capability-composer.ts — Route-Scoped Security, Manifest & .well-known', async () => {
  const {
    newCspNonce,
    composeRouteSecurityHeaders,
    buildSandboxIframeAttributes,
    composeWebAppManifest,
    composeWellKnownHandlers,
    DEFAULT_PERMISSIONS_POLICY,
  } = await import('../reference/capability-composer.ts');

  // 2a. Nonce generation
  const nonce = newCspNonce();
  assert.equal(typeof nonce, 'string');
  assert.ok(nonce.length >= 20, 'nonce must be valid base64 128-bit');

  // 2b. Baseline headers on root route
  const baseHeaders = composeRouteSecurityHeaders({
    pathname: '/',
    nonce,
    reportSinkUrl: '/api/reports',
  });

  assert.ok(baseHeaders['content-security-policy'].includes(`'nonce-${nonce}'`));
  assert.ok(!baseHeaders['content-security-policy'].includes("'unsafe-inline'"));
  assert.ok(baseHeaders['permissions-policy'].includes('camera=()'));
  assert.ok(baseHeaders['permissions-policy'].includes('microphone=()'));
  assert.equal(baseHeaders['server-timing'], undefined, 'Server-Timing omitted by default');

  // 2c. Route-Scoped Feature Unlock
  const testSlices = [
    {
      id: 'voice-recorder',
      routes: ['/record', '/record/*'],
      permissionsPolicy: { microphone: ['self'] },
      cspDirectives: { 'media-src': ["'self'", 'blob:'] },
    },
    {
      id: 'byok-chat',
      routes: ['/chat'],
      cspDirectives: { 'connect-src': ["'self'", 'https://generativelanguage.googleapis.com'] },
      llmMode: 'client-byok',
      adr: '0002',
      justification: 'User supplies Gemini API key for local browser chat',
    },
  ];

  // Route /record gets microphone unlocked
  const recordHeaders = composeRouteSecurityHeaders({
    pathname: '/record',
    nonce,
    slices: testSlices,
    enableServerTiming: true,
    serverTiming: [{ name: 'db', dur: 12.4 }],
  });

  assert.ok(recordHeaders['permissions-policy'].includes('microphone=(self)'));
  assert.ok(recordHeaders['content-security-policy'].includes("blob:"));
  assert.ok(recordHeaders['server-timing'].includes('db;dur=12'));

  // Route / maintains strict microphone=()
  const homeHeaders = composeRouteSecurityHeaders({
    pathname: '/',
    nonce,
    slices: testSlices,
  });
  assert.ok(homeHeaders['permissions-policy'].includes('microphone=()'));
  assert.ok(!homeHeaders['content-security-policy'].includes("blob:"));

  // 2d. Enforce LLM Credential Broker: forbid unapproved direct LLM connect-src
  assert.throws(() => {
    composeRouteSecurityHeaders({
      pathname: '/rogue',
      nonce,
      slices: [
        {
          id: 'rogue-chat',
          routes: ['/rogue'],
          cspDirectives: { 'connect-src': ['https://api.openai.com'] },
          // Missing llmMode: "client-byok" and ADR!
        },
      ],
    });
  }, /without llmMode: "client-byok"/);

  // 2e. Sandbox iframe attributes
  const iframeAttrs = buildSandboxIframeAttributes({
    id: 'preview',
    routes: ['/preview'],
    permissionsPolicy: { fullscreen: ['self'] },
  });
  assert.equal(iframeAttrs.sandbox, 'allow-scripts');
  assert.equal(iframeAttrs.loading, 'lazy');
  assert.ok(iframeAttrs.csp.includes("connect-src 'none'"));

  // 2f. Composable Web App Manifest
  const baseManifest = {
    name: 'Base App',
    short_name: 'Base',
    start_url: '/',
    display: 'standalone',
    shortcuts: [{ name: 'Home', url: '/' }],
  };

  const sliceWithShortcuts = {
    id: 'studio-slice',
    routes: ['/studio'],
    manifest: {
      shortcuts: [{ name: 'New Project', url: '/studio/new' }],
      file_handlers: [
        {
          action: '/studio/open',
          accept: { 'audio/*': ['.wav', '.mp3'] },
        },
      ],
      protocol_handlers: [{ protocol: 'web+sound', url: '/studio/play?src=%s' }],
      share_target: {
        action: '/studio/share',
        params: { title: 'title', text: 'text' },
      },
    },
  };

  const composedManifest = composeWebAppManifest(baseManifest, [sliceWithShortcuts]);
  assert.equal(composedManifest.name, 'Base App');
  assert.equal(composedManifest.shortcuts.length, 2);
  assert.equal(composedManifest.shortcuts[1].name, 'New Project');
  assert.equal(composedManifest.file_handlers.length, 1);
  assert.equal(composedManifest.file_handlers[0].action, '/studio/open');
  assert.equal(composedManifest.protocol_handlers[0].protocol, 'web+sound');
  assert.equal(composedManifest.share_target.action, '/studio/share');

  // 2g. Conditional .well-known Endpoints
  const wellKnownSlices = [
    {
      id: 'auth-slice',
      routes: ['/auth/*'],
      wellKnown: {
        changePasswordUrl: '/settings/security/password',
      },
    },
    {
      id: 'passkey-slice',
      routes: ['/login'],
      wellKnown: {
        webauthnOrigins: ['https://example.com'],
        assetLinks: [{ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app' } }],
      },
    },
  ];

  const wkHandlers = composeWellKnownHandlers(wellKnownSlices);
  assert.ok(wkHandlers['/.well-known/change-password']);
  assert.equal(wkHandlers['/.well-known/change-password'].status, 302);
  assert.equal(wkHandlers['/.well-known/change-password'].headers.Location, '/settings/security/password');

  assert.ok(wkHandlers['/.well-known/webauthn']);
  assert.equal(wkHandlers['/.well-known/webauthn'].status, 200);
  assert.ok(wkHandlers['/.well-known/webauthn'].body.includes('https://example.com'));

  assert.ok(wkHandlers['/.well-known/assetlinks.json']);
  assert.equal(wkHandlers['/.well-known/assetlinks.json'].status, 200);
  assert.ok(wkHandlers['/.well-known/assetlinks.json'].body.includes('android_app'));
});

test('3. reference/observability.ts — Longitudinal Zero-Data-Loss Engine', async () => {
  const {
    createLongitudinalStore,
    redactSensitive,
    computePercentiles,
    parseAndRecordCwv,
    ingestBrowserReports,
  } = await import('../reference/observability.ts');

  // 3a. Secret Redaction
  const dirty = {
    apiKey: 'secret-123',
    authorization: 'Bearer sensitive-token-xyz',
    url: 'https://example.com/api?token=secret99&other=1',
    user: { password: 'plain-password', name: 'Alice' },
    __proto__: { bad: true },
  };
  const cleaned = redactSensitive(dirty);
  assert.equal(cleaned.apiKey, '[redacted]');
  assert.equal(cleaned.authorization, '[redacted]');
  assert.ok(cleaned.url.includes('token=[redacted]'));
  assert.equal(cleaned.user.password, '[redacted]');
  assert.equal(cleaned.user.name, 'Alice');
  assert.equal(cleaned.bad, undefined);

  // 3b. Percentiles Computation
  const pResult = computePercentiles([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
  assert.equal(pResult.p50, 60);
  assert.equal(pResult.min, 10);
  assert.equal(pResult.max, 100);

  // 3c. Longitudinal Store & Write-Time Fingerprint Deduplication
  const store = createLongitudinalStore();

  // Ingest 20 identical CSP reports in a flood
  const rawCspBatch = JSON.stringify(
    Array.from({ length: 20 }, () => ({
      type: 'csp-violation',
      url: 'https://example.com/items/12345',
      body: { blockedURL: 'https://malicious.example.com/bad.js' },
    }))
  );

  const ingestRes = await ingestBrowserReports(rawCspBatch, 'application/reports+json', store, 'commit-a');
  assert.equal(ingestRes.accepted, 20);

  // Query summary: deduplication collapsed identical entries into occurrences
  const summary = store.querySummary({ severity: 'all' });
  assert.equal(summary.totalMatches, 20);
  assert.equal(summary.byType['report.csp-violation'], 20);

  // Query errors feed
  const errorsFeed = store.queryErrors({ severity: 'warn' });
  assert.ok(errorsFeed.events.length >= 1);
  const firstEvent = errorsFeed.events[0];
  assert.equal(firstEvent.occurrences, 20, 'Occurrences must reflect all 20 deduplicated flood instances');

  // 3d. Attribute-Level CWV & Permanent Percentile Rollups
  await parseAndRecordCwv(
    {
      metric: 'lcp',
      value: 1100, // Good
      page: '/home',
      elementSelector: 'h1.hero-title',
    },
    store,
    'commit-a'
  );

  await parseAndRecordCwv(
    {
      metric: 'lcp',
      value: 4200, // Poor -> Error
      page: '/home',
      elementSelector: 'img.banner',
    },
    store,
    'commit-a'
  );

  await parseAndRecordCwv(
    {
      metric: 'loaf',
      value: 85, // LoAF > 50ms -> Warn
      page: '/home',
      loafAttribution: [{ sourceURL: '/bundle.js', sourceFunctionName: 'renderTable' }],
    },
    store,
    'commit-a'
  );

  // Check trend percentiles across commit-a
  const lcpTrends = store.queryTrends({ metric: 'lcp', commit: 'commit-a' });
  assert.equal(lcpTrends.count, 2);
  assert.equal(lcpTrends.min, 1100);
  assert.equal(lcpTrends.max, 4200);

  // Verify health document
  const health = store.getHealth('commit-a');
  assert.equal(health.status, 'ok');
  assert.equal(health.version.commit, 'commit-a');
});

test('4. reference/micro-bus.ts — Microkernel Event/Command Dispatch & Lazy Slices', async () => {
  const { createMicroBus } = await import('../reference/micro-bus.ts');

  const bus = createMicroBus();
  let receivedEvent = null;
  let receivedCommand = null;

  bus.on('cart:update', (e) => {
    receivedEvent = e.payload;
  });

  bus.onCommand('modal:open', (c) => {
    receivedCommand = c.payload;
  });

  bus.emit('cart:update', { items: 3 });
  bus.command('modal:open', { id: 'login-modal' });

  assert.deepEqual(receivedEvent, { items: 3 });
  assert.deepEqual(receivedCommand, { id: 'login-modal' });

  // Test lazy slice registration
  let loaded = false;
  bus.registerLazySlice('slice-checkout', {
    tagName: 'app-checkout',
    commands: ['checkout:start'],
    loader: async () => {
      loaded = true;
    },
  });

  assert.equal(loaded, false);
  bus.command('checkout:start', { cartId: '123' });

  // Yield to allow async loader microtask to resolve
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(loaded, true, 'Lazy slice must hydrate on first matching command');

  bus.destroy();
});

test('5. reference/service-worker.ts & reference/sw-updater.ts — Staged SW, Nonce Re-stamping & State Checkpointing', async () => {
  const {
    generateSwNonce,
    rewriteCachedHtmlWithFreshNonce,
    createServiceWorkerController,
  } = await import('../reference/service-worker.ts');

  const {
    checkpointClientStateToSessionStorage,
    restoreClientStateFromSessionStorage,
    CHECKPOINT_STORAGE_KEY,
  } = await import('../reference/sw-updater.ts');

  // 5a. SW Nonce Generation
  const swNonce1 = generateSwNonce();
  const swNonce2 = generateSwNonce();
  assert.ok(swNonce1.startsWith('sw-'));
  assert.notEqual(swNonce1, swNonce2);

  // 5b. Shared CSP Nonce Re-Stamping on Cached Shell
  const cachedHtml = `<!doctype html><html><head><script nonce="srv-stale-999" src="/app.js"></script><style nonce="srv-stale-999">body{margin:0}</style></head><body><h1>Cached Shell</h1></body></html>`;
  const originalHeaders = {
    'content-type': 'text/html; charset=utf-8',
    'content-security-policy': "default-src 'self'; script-src 'self' 'nonce-srv-stale-999' 'strict-dynamic'; style-src 'self' 'nonce-srv-stale-999';",
  };

  const rewritten = rewriteCachedHtmlWithFreshNonce(cachedHtml, originalHeaders);
  assert.ok(rewritten.nonce.startsWith('sw-'));
  assert.equal(rewritten.headers['x-served-by'], 'service-worker-cache');
  assert.ok(rewritten.headers['content-security-policy'].includes(`'nonce-${rewritten.nonce}'`));
  assert.ok(!rewritten.headers['content-security-policy'].includes('srv-stale-999'));
  assert.ok(rewritten.html.includes(`nonce="${rewritten.nonce}"`));
  assert.ok(!rewritten.html.includes('srv-stale-999'));

  // 5c. Service Worker Controller Lifecycle & Staged Updates
  const swCtrl = createServiceWorkerController({
    commit: 'test-commit-42',
    shellRoutes: ['/', '/index.html'],
  });

  let skipWaitingCalled = false;
  const mockSwGlobalWithActive = {
    registration: { active: { state: 'activated' } },
    skipWaiting: async () => {
      skipWaitingCalled = true;
    },
    caches: {
      open: async () => ({
        addAll: async () => {},
      }),
    },
  };

  // When active controller exists: MUST NOT call skipWaiting() automatically
  await swCtrl.handleInstall({}, mockSwGlobalWithActive);
  assert.equal(skipWaitingCalled, false, 'Service Worker MUST NOT auto-skipWaiting over an active controller');

  // When no active controller exists: auto-skipWaiting is permitted for initial boot
  const mockSwGlobalFirstLoad = {
    registration: { active: null },
    skipWaiting: async () => {
      skipWaitingCalled = true;
    },
    caches: {
      open: async () => ({
        addAll: async () => {},
      }),
    },
  };
  await swCtrl.handleInstall({}, mockSwGlobalFirstLoad);
  assert.equal(skipWaitingCalled, true, 'First-load SW without active controller may skipWaiting');

  // Message handler receives SKIP_WAITING
  let messageSkipWaiting = false;
  await swCtrl.handleMessage(
    { data: { type: 'SKIP_WAITING' } },
    {
      registration: {},
      skipWaiting: async () => {
        messageSkipWaiting = true;
      },
      caches: {},
    }
  );
  assert.equal(messageSkipWaiting, true);

  // Message handler receives KILL_SW
  let unregistered = false;
  let cachesPurged = false;
  await swCtrl.handleMessage(
    { data: { type: 'KILL_SW' } },
    {
      registration: {
        unregister: async () => {
          unregistered = true;
        },
      },
      caches: {
        keys: async () => ['shell-v1', 'static-v1'],
        delete: async () => {
          cachesPurged = true;
        },
      },
      skipWaiting: async () => {},
    }
  );
  assert.equal(unregistered, true);
  assert.equal(cachesPurged, true);

  // 5d. Form & Scroll State Checkpointing
  const storageMap = new Map();
  const mockStorage = {
    getItem: (k) => (storageMap.has(k) ? storageMap.get(k) : null),
    setItem: (k, v) => storageMap.set(k, String(v)),
    removeItem: (k) => storageMap.delete(k),
  };

  const inputUsername = { id: 'user-input', name: 'user', type: 'text', value: 'alice' };
  const inputPassword = { id: 'pwd-input', name: 'pwd', type: 'password', value: 'secret-pass' };
  const inputSensitive = { id: 'token-input', name: 'token', type: 'text', value: 'sensitive-token', hasAttribute: (a) => a === 'data-sensitive', getAttribute: () => 'true' };
  const inputCheckbox = { id: 'terms-check', name: 'terms', type: 'checkbox', checked: true };

  const mockDoc = {
    querySelectorAll: () => [inputUsername, inputCheckbox], // DOM query already excludes password and data-sensitive
    querySelector: (sel) => {
      if (sel === '#user-input') return inputUsername;
      if (sel === '#terms-check') return inputCheckbox;
      return null;
    },
  };

  const mockWin = { scrollX: 100, scrollY: 250, scrollTo: (x, y) => { mockWin.scrollX = x; mockWin.scrollY = y; } };

  const checkpoint = checkpointClientStateToSessionStorage(mockStorage, mockDoc, mockWin);
  assert.ok(checkpoint);
  assert.equal(checkpoint.scrollX, 100);
  assert.equal(checkpoint.scrollY, 250);
  assert.equal(checkpoint.inputs.length, 2);

  // Clear inputs and restore
  inputUsername.value = '';
  inputCheckbox.checked = false;
  mockWin.scrollX = 0;
  mockWin.scrollY = 0;

  const restored = restoreClientStateFromSessionStorage(mockStorage, mockDoc, mockWin);
  assert.equal(restored, true);
  assert.equal(inputUsername.value, 'alice');
  assert.equal(inputCheckbox.checked, true);
  assert.equal(mockWin.scrollX, 100);
  assert.equal(mockWin.scrollY, 250);
});

test('6. Scaffolding & Gate Scripts execution in isolated temp dir', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'default-prompt-test-'));

  t.after(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  // Run bootstrap script
  const bootstrapScript = path.join(rootDir, 'scripts', 'bootstrap-web-app.sh');
  execSync(`bash "${bootstrapScript}" "${tempDir}" "test-app"`, { stdio: 'pipe' });

  // Verify key files exist in target
  assert.ok(fs.existsSync(path.join(tempDir, 'AGENTS.md')));
  assert.ok(fs.existsSync(path.join(tempDir, 'THREAT_MODEL.md')));
  assert.ok(fs.existsSync(path.join(tempDir, 'DESIGN.md')));
  assert.ok(fs.existsSync(path.join(tempDir, 'perf-budget.json')));
  assert.ok(fs.existsSync(path.join(tempDir, 'public', 'tokens.css')));
  assert.ok(fs.existsSync(path.join(tempDir, 'public', 'manifest.webmanifest')));
  assert.ok(fs.existsSync(path.join(tempDir, 'public', 'sw.js')));
  assert.ok(fs.existsSync(path.join(tempDir, 'public', 'humans.txt')));
  assert.ok(fs.existsSync(path.join(tempDir, 'public', 'robots.txt')));
  assert.ok(fs.existsSync(path.join(tempDir, 'public', 'llms.txt')));
  assert.ok(fs.existsSync(path.join(tempDir, 'public', '.well-known', 'security.txt')));
  assert.ok(fs.existsSync(path.join(tempDir, 'public', '.well-known', 'traffic-advice')));
  assert.ok(fs.existsSync(path.join(tempDir, 'src', 'lib', 'micro-bus.ts')));
  assert.ok(fs.existsSync(path.join(tempDir, 'src', 'lib', 'capability-composer.ts')));
  assert.ok(fs.existsSync(path.join(tempDir, 'src', 'lib', 'service-worker.ts')));
  assert.ok(fs.existsSync(path.join(tempDir, 'src', 'lib', 'sw-updater.ts')));
  assert.ok(fs.existsSync(path.join(tempDir, 'src', 'lib', 'observability.ts')));
  assert.ok(fs.existsSync(path.join(tempDir, 'scripts', 'fast-gate.sh')));
  assert.ok(fs.existsSync(path.join(tempDir, 'scripts', 'check-discovery.mjs')));

  // Run discovery check on clean scaffold
  execSync(`node "${path.join(tempDir, 'scripts', 'check-discovery.mjs')}"`, {
    cwd: tempDir,
    stdio: 'pipe',
  });

  // Verify expired security.txt fails check-discovery
  const secTxtFile = path.join(tempDir, 'public', '.well-known', 'security.txt');
  const validSecTxt = fs.readFileSync(secTxtFile, 'utf-8');
  fs.writeFileSync(secTxtFile, validSecTxt.replace(/Expires: .*/, 'Expires: 2020-01-01T00:00:00.000Z'));
  assert.throws(() => {
    execSync(`node "${path.join(tempDir, 'scripts', 'check-discovery.mjs')}"`, {
      cwd: tempDir,
      stdio: 'pipe',
    });
  }, /Command failed/);
  // Restore valid security.txt
  fs.writeFileSync(secTxtFile, validSecTxt);

  // Run single-owner on clean scaffold
  execSync(`node "${path.join(tempDir, 'scripts', 'single-owner.mjs')}"`, {
    cwd: tempDir,
    stdio: 'pipe',
  });

  // Run check-perf-budget on clean scaffold
  execSync(`node "${path.join(tempDir, 'scripts', 'check-perf-budget.mjs')}"`, {
    cwd: tempDir,
    stdio: 'pipe',
  });

  // Test Capability Gate: create a feature with an undocumented capability
  const sliceDir = path.join(tempDir, 'src', 'features', 'unregistered-slice');
  fs.mkdirSync(sliceDir, { recursive: true });
  fs.writeFileSync(
    path.join(sliceDir, 'capabilities.ts'),
    `export const capabilities = { permissionsPolicy: { microphone: ['self'] } };\n`
  );

  // check-capabilities must fail on undocumented slice
  assert.throws(() => {
    execSync(`node "${path.join(tempDir, 'scripts', 'check-capabilities.mjs')}"`, {
      cwd: tempDir,
      stdio: 'pipe',
    });
  }, /Command failed/);

  // Now register slice in THREAT_MODEL.md §3
  const tmPath = path.join(tempDir, 'THREAT_MODEL.md');
  const tmContent = fs.readFileSync(tmPath, 'utf-8');
  const updatedTm = tmContent.replace(
    /\| base-app \|.*$/m,
    `| base-app | /* | default-src 'self' | (all disabled) | 0001 | Baseline |\n| unregistered-slice | /record | default-src 'self' | microphone=(self) | 0002 | Voice recording feature |`
  );
  fs.writeFileSync(tmPath, updatedTm);

  // check-capabilities must now pass
  execSync(`node "${path.join(tempDir, 'scripts', 'check-capabilities.mjs')}"`, {
    cwd: tempDir,
    stdio: 'pipe',
  });

  // Test OS Manifest Capability Gate
  const pwaSliceDir = path.join(tempDir, 'src', 'features', 'pwa-handler');
  fs.mkdirSync(pwaSliceDir, { recursive: true });
  fs.writeFileSync(
    path.join(pwaSliceDir, 'capabilities.ts'),
    `export const capabilities = { manifest: { file_handlers: [{ action: '/view' }] } };\n`
  );
  assert.throws(() => {
    execSync(`node "${path.join(tempDir, 'scripts', 'check-capabilities.mjs')}"`, {
      cwd: tempDir,
      stdio: 'pipe',
    });
  }, /Command failed/);

  // Register pwa-handler in THREAT_MODEL.md §3
  const tmWithPwa = fs.readFileSync(tmPath, 'utf-8').replace(
    /\| unregistered-slice \|.*$/m,
    `| unregistered-slice | /record | default-src 'self' | microphone=(self) | 0002 | Voice recording feature |\n| pwa-handler | /view | default-src 'self' | (all disabled) | 0003 | OS file handler surface |`
  );
  fs.writeFileSync(tmPath, tmWithPwa);

  execSync(`node "${path.join(tempDir, 'scripts', 'check-capabilities.mjs')}"`, {
    cwd: tempDir,
    stdio: 'pipe',
  });

  // Run fast-gate in scaffold
  execSync(`bash "${path.join(tempDir, 'scripts', 'fast-gate.sh')}"`, {
    cwd: tempDir,
    stdio: 'pipe',
  });

  // Test root install.sh into a second isolated directory with default target dir (.)
  const installTestDir = fs.mkdtempSync(path.join(os.tmpdir(), 'default-prompt-install-'));
  try {
    const installScript = path.join(rootDir, 'install.sh');
    execSync(`DEFAULT_PROMPT_SOURCE_DIR="${rootDir}" bash "${installScript}" . "curl-app"`, {
      cwd: installTestDir,
      stdio: 'pipe',
    });
    assert.ok(fs.existsSync(path.join(installTestDir, 'AGENTS.md')));
    assert.ok(fs.existsSync(path.join(installTestDir, 'DESIGN.md')));
    assert.ok(fs.existsSync(path.join(installTestDir, 'public', 'manifest.webmanifest')));
    assert.ok(fs.existsSync(path.join(installTestDir, 'public', '.well-known', 'security.txt')));
    assert.ok(fs.existsSync(path.join(installTestDir, 'scripts', 'fast-gate.sh')));
    execSync(`bash "${path.join(installTestDir, 'scripts', 'fast-gate.sh')}"`, {
      cwd: installTestDir,
      stdio: 'pipe',
    });
  } finally {
    try {
      fs.rmSync(installTestDir, { recursive: true, force: true });
    } catch {}
  }
});
