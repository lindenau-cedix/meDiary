#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# deploy.sh — Produktiv-Deployment auf diesem Host via systemd
#
# 1. Liest .env (WEB_DIST, PORT, DB_PATH, DEFAULTS_PATH, CF_ACCESS_*)
# 2. Baut Frontend + Backend (build.sh)
# 3. Kopiert den Build nach ~/mediary
# 4. Kopiert mediary.service nach ~/.config/systemd/user/
# 5. Startet den systemd-User-Service
#
# Nicht als root ausführen — systemd --user läuft unter dem aktuellen User.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="${SCRIPT_DIR}/build"
TARGET_DIR="${HOME}/mediary"
ENV_FILE="${SCRIPT_DIR}/.env"

# --- .env lesen (nur WEB_DIST und andere steuerbare Env-Vars) ---
declare -A ENV_VARS
if [[ -f "${ENV_FILE}" ]]; then
  echo "==> Lese Konfiguration aus ${ENV_FILE} ..."
  while IFS='=' read -r key value; do
    # Nur nicht-leere, nicht-kommentierte Zeilen
    [[ -z "${key}" || "${key}" == \#* ]] && continue
    # Trimming
    key=$(echo "${key}" | xargs)
    value=$(echo "${value}" | xargs)
    [[ -z "${key}" ]] && continue
    ENV_VARS["${key}"]="${value}"
  done < "${ENV_FILE}"
else
  echo "==> Keine .env gefunden — verwende Defaults."
fi

WEB_DIST="${ENV_VARS[WEB_DIST]:-}"

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

# --- systemd Service installieren (mit Env-Injection aus .env) ---
echo "==> Installiere systemd Service ..."
mkdir -p "${HOME}/.config/systemd/user"

# Env-Vars für den Service zusammenbauen
SERVICE_ENV=""
if [[ -n "${WEB_DIST}" ]]; then
  SERVICE_ENV="${SERVICE_ENV}Environment=\"WEB_DIST=${WEB_DIST}\""
fi
# Weitere Env-Vars aus .env durchreichen (PORT, DB_PATH, DEFAULTS_PATH, CF_ACCESS_*)
for key in PORT DB_PATH DEFAULTS_PATH CF_ACCESS_TEAM_DOMAIN CF_ACCESS_AUD CF_ACCESS_CERTS_URL CF_ACCESS_DISABLED; do
  if [[ -n "${ENV_VARS[${key}]:-}" ]]; then
    SERVICE_ENV="${SERVICE_ENV}\nEnvironment=\"${key}=${ENV_VARS[${key}]}\""
  fi
done

if [[ -n "${SERVICE_ENV}" ]]; then
  echo "==> Service-Env: ${SERVICE_ENV}"
  # Service-Datei mit injected Env-Vars schreiben
  sed "s|# Environment=\"WEB_DIST=/custom/path/web/dist\"|${SERVICE_ENV}|" \
    "${SCRIPT_DIR}/mediary.service" > "${HOME}/.config/systemd/user/mediary.service"
else
  cp "${SCRIPT_DIR}/mediary.service" "${HOME}/.config/systemd/user/mediary.service"
fi

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