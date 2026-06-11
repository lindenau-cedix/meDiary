#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# start.sh — wird vom systemd-Service aufgerufen
# Erzeugt das Datenverzeichnis und startet den Server.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="${HOME}/.local/share/mediary"

# Datenverzeichnis anlegen (DB + DEFAULTS landen dort)
mkdir -p "${DATA_DIR}/data"

# DEFAULTS.md anlegen, falls nicht vorhanden (leerer Stub)
if [ ! -f "${DATA_DIR}/DEFAULTS.md" ]; then
  if [ -f "${SCRIPT_DIR}/DEFAULTS.md" ]; then
    cp "${SCRIPT_DIR}/DEFAULTS.md" "${DATA_DIR}/DEFAULTS.md"
    echo "==> DEFAULTS.md nach ${DATA_DIR} kopiert."
  fi
fi

cd "${SCRIPT_DIR}"

echo "==> Starte meDiary auf Port ${PORT:-4000}"
echo "    DB:     ~/.local/share/mediary/data/mediary.db"
echo "    DEFAULTS: ~/.local/share/mediary/DEFAULTS.md"
exec node dist/index.js