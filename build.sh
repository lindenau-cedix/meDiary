#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# build.sh — Produktiv-Build: Frontend + Backend kompilieren
# Ausgabe: build/-Verzeichnis mit allem, was auf dem Server laufen muss.
# Keine Annahmen über das aktuelle Verzeichnis.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="${SCRIPT_DIR}/build"

echo "==> Bauen in ${BUILD_DIR} ..."

# --- saubere Ausgabe ---
rm -rf "${BUILD_DIR}"
mkdir -p "${BUILD_DIR}"

# --- Frontend ---
echo "==> Frontend bauen ..."
"${SCRIPT_DIR}/web/node_modules/.bin/vite" build \
  --outDir "${BUILD_DIR}/web/dist" \
  --emptyOutDir

# --- Backend (TypeScript → JS) ---
echo "==> Backend bauen ..."
"${SCRIPT_DIR}/server/node_modules/.bin/tsc" -p "${SCRIPT_DIR}/server/tsconfig.json"

# --- node_modules (Production!) ---
echo "==> Server node_modules (production) ..."
cp -r "${SCRIPT_DIR}/server/node_modules" "${BUILD_DIR}/"
cp       "${SCRIPT_DIR}/server/package.json" "${BUILD_DIR}/"
cp       "${SCRIPT_DIR}/server/package-lock.json" "${BUILD_DIR}/" 2>/dev/null || true

# --- Helm: Start-Skript + DEFAULTS-Template + README ---
cp "${SCRIPT_DIR}/start.sh"              "${BUILD_DIR}/"
cp "${SCRIPT_DIR}/DEFAULTS.md"           "${BUILD_DIR}/"
cp "${SCRIPT_DIR}/README.md"             "${BUILD_DIR}/" 2>/dev/null || true
chmod +x "${BUILD_DIR}/start.sh"

echo "==> Build fertig: ${BUILD_DIR}"
echo "    Server: node build/dist/index.js"
echo "    DB:     ~/.local/share/mediary/data/mediary.db"
echo "    Web:    http://localhost:4000"