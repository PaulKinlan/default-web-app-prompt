#!/usr/bin/env bash
# install.sh — One-liner installer for Default Web App Prompt & Architecture Toolkit
#
# Usage via curl:
#   curl -fsSL https://raw.githubusercontent.com/PaulKinlan/default-web-app-prompt/main/install.sh | bash
#   curl -fsSL https://raw.githubusercontent.com/PaulKinlan/default-web-app-prompt/main/install.sh | bash -s -- ./my-app "my-app"
#
# Usage locally:
#   bash install.sh [target-dir] [app-name]

set -eo pipefail

TARGET_DIR="${1:-.}"
APP_NAME="${2:-}"

echo "==> [install.sh] Bootstrapping Default Web App in '${TARGET_DIR}'..."

# Check if running within a local clone of the repository
SCRIPT_DIR=""
if [ -n "${BASH_SOURCE[0]:-}" ] && [ -f "${BASH_SOURCE[0]}" ]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd || true)"
fi

if [ -n "${DEFAULT_PROMPT_SOURCE_DIR:-}" ] && [ -d "${DEFAULT_PROMPT_SOURCE_DIR}/templates" ]; then
  echo "--> Using specified source directory: ${DEFAULT_PROMPT_SOURCE_DIR}"
  bash "${DEFAULT_PROMPT_SOURCE_DIR}/scripts/bootstrap-web-app.sh" "${TARGET_DIR}" "${APP_NAME}"
elif [ -n "${SCRIPT_DIR}" ] && [ -d "${SCRIPT_DIR}/templates" ] && [ -f "${SCRIPT_DIR}/scripts/bootstrap-web-app.sh" ]; then
  echo "--> Using local repository at: ${SCRIPT_DIR}"
  bash "${SCRIPT_DIR}/scripts/bootstrap-web-app.sh" "${TARGET_DIR}" "${APP_NAME}"
else
  # Running via curl | bash — download repository archive from GitHub
  TMP_DIR="$(mktemp -d)"
  trap 'rm -rf "${TMP_DIR}"' EXIT

  REPO_TARBALL_URL="https://github.com/PaulKinlan/default-web-app-prompt/archive/refs/heads/main.tar.gz"
  echo "--> Downloading default-web-app-prompt from GitHub..."
  curl -fsSL "${REPO_TARBALL_URL}" | tar -xz -C "${TMP_DIR}" --strip-components=1

  bash "${TMP_DIR}/scripts/bootstrap-web-app.sh" "${TARGET_DIR}" "${APP_NAME}"
fi

echo "==> [install.sh] Bootstrap complete!"
echo "==> Next steps:"
echo "    cd ${TARGET_DIR}"
echo "    bash scripts/fast-gate.sh"
