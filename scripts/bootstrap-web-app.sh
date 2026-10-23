#!/usr/bin/env bash
# scripts/bootstrap-web-app.sh — Scaffolds a new production web application
set -eo pipefail

TARGET_DIR="${1:-.}"
RESOLVED_DIR="$(cd "${TARGET_DIR}" 2>/dev/null && pwd || echo "${TARGET_DIR}")"
APP_NAME="${2:-$(basename "${RESOLVED_DIR}")}"

if [ -n "${DEFAULT_PROMPT_SOURCE_DIR:-}" ] && [ -d "${DEFAULT_PROMPT_SOURCE_DIR}/templates" ]; then
  SOURCE_DIR="${DEFAULT_PROMPT_SOURCE_DIR}"
else
  SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." 2>/dev/null && pwd)"
fi

if [ ! -d "${SOURCE_DIR}/templates" ]; then
  echo "Error: Cannot locate templates in '${SOURCE_DIR}'."
  exit 1
fi

echo "==> Scaffolding new web application '${APP_NAME}' in ${TARGET_DIR}..."

mkdir -p "${TARGET_DIR}"/{docs/adr,docs/design-references,public/.well-known,src/features,src/lib,scripts,tests}

# 1. Copy and interpolate templates
sed "s/{{PROJECT_NAME}}/${APP_NAME}/g" "${SOURCE_DIR}/templates/AGENTS.md" > "${TARGET_DIR}/AGENTS.md"
sed "s/{{PROJECT_NAME}}/${APP_NAME}/g" "${SOURCE_DIR}/templates/THREAT_MODEL.md" > "${TARGET_DIR}/THREAT_MODEL.md"
sed "s/{{PROJECT_NAME}}/${APP_NAME}/g" "${SOURCE_DIR}/templates/DESIGN.md" > "${TARGET_DIR}/DESIGN.md"
sed "s/{{PROJECT_NAME}}/${APP_NAME}/g" "${SOURCE_DIR}/templates/wrangler.jsonc" > "${TARGET_DIR}/wrangler.jsonc"
cp "${SOURCE_DIR}/templates/perf-budget.json" "${TARGET_DIR}/perf-budget.json"
cp "${SOURCE_DIR}/templates/tokens.css" "${TARGET_DIR}/public/tokens.css"
cp -r "${SOURCE_DIR}/templates/docs/"* "${TARGET_DIR}/docs/"

# Discovery and manifest metadata
sed "s/{{PROJECT_NAME}}/${APP_NAME}/g" "${SOURCE_DIR}/templates/public/.well-known/security.txt" > "${TARGET_DIR}/public/.well-known/security.txt"
cp "${SOURCE_DIR}/templates/public/.well-known/traffic-advice" "${TARGET_DIR}/public/.well-known/traffic-advice"
sed "s/{{PROJECT_NAME}}/${APP_NAME}/g" "${SOURCE_DIR}/templates/public/humans.txt" > "${TARGET_DIR}/public/humans.txt"
sed "s/{{PROJECT_NAME}}/${APP_NAME}/g" "${SOURCE_DIR}/templates/public/robots.txt" > "${TARGET_DIR}/public/robots.txt"
sed "s/{{PROJECT_NAME}}/${APP_NAME}/g" "${SOURCE_DIR}/templates/public/llms.txt" > "${TARGET_DIR}/public/llms.txt"
sed "s/{{PROJECT_NAME}}/${APP_NAME}/g" "${SOURCE_DIR}/templates/public/manifest.webmanifest" > "${TARGET_DIR}/public/manifest.webmanifest"

# 2. Copy reference modules into src/lib/ and service worker into public/sw.js
cp "${SOURCE_DIR}/reference/"*.ts "${TARGET_DIR}/src/lib/"
cp "${SOURCE_DIR}/reference/service-worker.ts" "${TARGET_DIR}/public/sw.js"

# 3. Copy scripts
cp "${SOURCE_DIR}/scripts/"*.mjs "${TARGET_DIR}/scripts/"
cp "${SOURCE_DIR}/scripts/"*.sh "${TARGET_DIR}/scripts/"
chmod +x "${TARGET_DIR}/scripts/"*.sh "${TARGET_DIR}/scripts/"*.mjs

# 4. Create base index.html with semantic slots, manifest link, and SW updater
cat << 'EOF' > "${TARGET_DIR}/public/index.html"
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>App</title>
  <link rel="stylesheet" href="/tokens.css">
  <link rel="manifest" href="/manifest.webmanifest">
  <link rel="author" href="/humans.txt">
  <script type="module">
    import { createMicroBus } from '/src/lib/micro-bus.ts';
    import { initBrowserObservability } from '/src/lib/observability-client.ts';
    import { createSwUpdateManager } from '/src/lib/sw-updater.ts';

    window.appBus = createMicroBus();
    initBrowserObservability({ reportUrl: '/api/reports', cwvUrl: '/api/observability/cwv' });
    
    // Register Service Worker with staged version updates and user reload prompt
    const swManager = createSwUpdateManager({
      currentCommit: 'dev',
      swScriptUrl: '/sw.js',
      healthUrl: '/health',
      bus: window.appBus,
    });
    swManager.init();
  </script>
</head>
<body>
  <div data-slot="sw-update-banner" hidden></div>
  <header data-slot="header"></header>
  <main data-slot="main">
    <h1 data-lcp fetchpriority="high">Welcome</h1>
    <p>Application shell initialized with zero-collision micro-bus.</p>
  </main>
  <aside data-slot="sidebar"></aside>
  <div data-slot="modals"></div>
  <footer data-slot="footer"></footer>
</body>
</html>
EOF

# 5. Initialize git repository if needed
if [ ! -d "${TARGET_DIR}/.git" ]; then
  echo "--> Initializing Git repository..."
  (cd "${TARGET_DIR}" && git init -q && git add -A && git commit -q -m "feat: initial scaffold from default-prompt" || true)
fi

echo "==> Web application '${APP_NAME}' scaffolded successfully at ${TARGET_DIR}."
echo "==> Run 'bash scripts/fast-gate.sh' in the target directory to verify."
