#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# deploy.sh — Produktiv-Deployment auf diesem Host via systemd
#
# 1. Baut Frontend + Backend (build.sh)
# 2. Kopiert den Build nach ~/mediary
# 3. Kopiert mediary.service nach ~/.config/systemd/user/
# 4. Startet den systemd-User-Service
#
# Nicht als root ausführen — systemd --user läuft unter dem aktuellen User.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="${SCRIPT_DIR}/build"
TARGET_DIR="${HOME}/mediary"

# --- Build ---
"${SCRIPT_DIR}/build.sh"

# --- Bestehenden Service stoppen (falls gerade aktiv) ---
if systemctl --user is-active mediary &>/dev/null; then
  echo "==> Stoppe laufenden Service ..."
  systemctl --user stop mediary
fi

# --- Build nach ~/mediary spiegeln ---
echo "==> Installiere Build nach ${TARGET_DIR} ..."
rm -rf "${TARGET_DIR}"
cp -r "${BUILD_DIR}" "${TARGET_DIR}"

# --- systemd Service installieren ---
echo "==> Installiere systemd Service ..."
mkdir -p "${HOME}/.config/systemd/user"
cp "${SCRIPT_DIR}/mediary.service" "${HOME}/.config/systemd/user/mediary.service"

# --- systemd neu laden + starten ---
echo "==> Reload systemd ..."
systemctl --user daemon-reload

echo "==> Aktiviere und starte mediary ..."
systemctl --user enable --now mediary

# --- Status zeigen ---
echo ""
echo "=== Service Status ==="
systemctl --user status mediary --no-pager || true
echo ""
echo "=== Logs (letzte 20 Zeilen) ==="
journalctl --user-unit=mediary -n 20 --no-pager || true