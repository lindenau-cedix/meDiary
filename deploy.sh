#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# deploy.sh — Produktiv-Deployment auf diesem Host via systemd
#
# 1. Liest .env (WEB_DIST, PORT, DB_PATH, DEFAULTS_PATH, CF_ACCESS_*)
# 2. Baut Frontend + Backend (build.sh)
# 3. Kopiert den Build nach ~/mediary
# 4. Kopiert mediary.service nach ~/.config/systemd/user/, wobei die
#    Marker-Zeile `__MEDIARY_INJECT_ENV_HERE__` durch die Env-Lines
#    aus der .env ersetzt wird (eine `Environment=...`-Zeile pro Variable).
# 5. Startet den systemd-User-Service
#
# Nicht als root ausführen — systemd --user läuft unter dem aktuellen User.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="${SCRIPT_DIR}/build"
TARGET_DIR="${HOME}/mediary"
ENV_FILE="${SCRIPT_DIR}/.env"
SERVICE_TEMPLATE="${SCRIPT_DIR}/mediary.service"
SERVICE_TARGET="${HOME}/.config/systemd/user/mediary.service"
ENV_MARKER='__MEDIARY_INJECT_ENV_HERE__'

# --- .env lesen (WEB_DIST, PORT, DB_PATH, DEFAULTS_PATH, CF_ACCESS_*) ---
declare -A ENV_VARS
if [[ -f "${ENV_FILE}" ]]; then
  echo "==> Lese Konfiguration aus ${ENV_FILE} ..."
  while IFS='=' read -r key value; do
    # Nur nicht-leere, nicht-kommentierte Zeilen
    [[ -z "${key}" || "${key}" == \#* ]] && continue
    # Umgebende Whitespaces trimmen — OHNE xargs (das Anführungszeichen/
    # Backslashes interpretiert und unter `set -e` z. B. an einem Apostroph im
    # Wert abbräche). Reine Bash-Parameter-Expansion ist quote-/backslash-sicher.
    key="${key#"${key%%[![:space:]]*}"}"; key="${key%"${key##*[![:space:]]}"}"
    value="${value#"${value%%[![:space:]]*}"}"; value="${value%"${value##*[![:space:]]}"}"
    [[ -z "${key}" ]] && continue
    ENV_VARS["${key}"]="${value}"
  done < "${ENV_FILE}"
else
  echo "==> Keine .env gefunden — verwende Defaults."
fi

# --- WEB_DIST-Default erzwingen ---
# Ohne WEB_DIST landet der Service ohne statisches Frontend → `GET /` ergibt
# „Cannot GET /". Der Build (build.sh) legt das Frontend immer nach
# `build/web/dist` (→ ~/mediary/web/dist), und `WorkingDirectory=%h/mediary`
# löst `./web/dist` korrekt dorthin auf. Ist in der .env kein WEB_DIST gesetzt,
# spritzen wir diesen Default ein, damit das Frontend zuverlässig erreichbar ist.
# (Zusätzlich erkennt der Server `web/dist` neben dem Build auch ohne Env —
# Gürtel UND Hosenträger.)
if [[ -z "${ENV_VARS[WEB_DIST]:-}" ]]; then
  ENV_VARS[WEB_DIST]="./web/dist"
  echo "==> Kein WEB_DIST in .env — nutze Default './web/dist' (sonst 'Cannot GET /')."
fi

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
mkdir -p "$(dirname "${SERVICE_TARGET}")"

# Env-Vars für den Service zusammenbauen (als Array → echte Newlines).
# Reihenfolge: WEB_DIST zuerst (am wichtigsten für "Cannot GET /"),
# dann die übrigen.
SERVICE_ENV_LINES=()
if [[ -n "${ENV_VARS[WEB_DIST]:-}" ]]; then
  SERVICE_ENV_LINES+=("Environment=\"WEB_DIST=${ENV_VARS[WEB_DIST]}\"")
fi
for key in PORT DB_PATH DEFAULTS_PATH DIARY_PATH ANTHROPIC_API_KEY ANTHROPIC_BASE_URL DIARY_MODEL DIARY_THINKING DIARY_MAX_TOKENS MINIMAX_API_KEY MINIMAX_BASE_URL MINIMAX_MODEL DREAM_TIME DREAM_TZ DREAM_MAX_TOKENS DREAM_TEMPERATURE DREAM_THINKING DREAM_HTTP_TIMEOUT_MS DREAM_CATCHUP_DAYS DREAM_MIN_INTERVAL_MS DREAM_SCHEDULER_DISABLED DREAM_TRIGGER_TOKEN DREAM_TRUST_LOOPBACK DREAM_SYSTEM_PROMPT_PATH CF_ACCESS_TEAM_DOMAIN CF_ACCESS_AUD CF_ACCESS_CERTS_URL CF_ACCESS_DISABLED; do
  if [[ -n "${ENV_VARS[${key}]:-}" ]]; then
    SERVICE_ENV_LINES+=("Environment=\"${key}=${ENV_VARS[${key}]}\"")
  fi
done

# Service-Datei vorbereiten. Marker ersetzen, wenn:
#  (a) überhaupt Env-Lines injiziert werden sollen, UND
#  (b) die Marker-Zeile genau einmal im Template vorkommt.
# Sonst: fail-loud (Exit != 0), damit "Cannot GET /" nicht stillschweigend
# wiederkehrt, wenn jemand das Template driftet.
SHOULD_INJECT=false
if [[ ${#SERVICE_ENV_LINES[@]} -gt 0 ]]; then
  SHOULD_INJECT=true
fi

if [[ "${SHOULD_INJECT}" == "true" ]]; then
  # Marker genau einmal vorhanden?
  marker_count=$(grep -cF "${ENV_MARKER}" "${SERVICE_TEMPLATE}" || true)
  if [[ "${marker_count}" -ne 1 ]]; then
    echo "FEHLER: Env-Injection angefordert, aber Marker '${ENV_MARKER}'" >&2
    echo "       kommt in ${SERVICE_TEMPLATE} ${marker_count}-mal vor (erwartet: 1)." >&2
    echo "       Ohne funktionierende Injection fehlt dem Service z. B." >&2
    echo "       WEB_DIST → 'Cannot GET /'." >&2
    echo "       Bitte die Marker-Zeile in mediary.service prüfen." >&2
    exit 1
  fi

  echo "==> Service-Env (${#SERVICE_ENV_LINES[@]} Zeilen):"
  # Geheimnisse (API-Key/Token/Secret) beim Loggen maskieren — sonst landet
  # z. B. ANTHROPIC_API_KEY im Terminal-Scrollback und in CI-Logs.
  for _line in "${SERVICE_ENV_LINES[@]}"; do
    case "${_line}" in
      *API_KEY=*|*SECRET=*|*TOKEN=*)
        printf '    %s\n' "$(printf '%s' "${_line}" | sed -E 's/(="?[^=]*=)[^"]*/\1***/')" ;;
      *)
        printf '    %s\n' "${_line}" ;;
    esac
  done

  # Env-Lines in eine Temp-Datei schreiben (echte Newlines).
  TMP_ENV="$(mktemp)"
  printf '%s\n' "${SERVICE_ENV_LINES[@]}" > "${TMP_ENV}"

  # awk: ersetze die Marker-Zeile durch den Inhalt der Temp-Datei
  # (eine Env-Zeile pro Zeile, Newlines bleiben erhalten). Robust gegen
  # mehrzeiligen Inhalt — sed scheitert hier, awk nicht.
  awk -v envfile="${TMP_ENV}" -v marker="${ENV_MARKER}" '
    $0 == "# " marker {
      while ((getline line < envfile) > 0) print line
      close(envfile)
      next
    }
    { print }
  ' "${SERVICE_TEMPLATE}" > "${SERVICE_TARGET}"
  rm -f "${TMP_ENV}"
else
  # Keine Env-Injection nötig: Template übernehmen, Marker-Zeile auskommentieren,
  # damit der Service-File im Klartext bleibt (kein kryptischer Marker im
  # produktiven systemd-File).
  sed "s|^# ${ENV_MARKER}\$|# (no .env variables injected by deploy.sh)|" \
    "${SERVICE_TEMPLATE}" > "${SERVICE_TARGET}"
fi

# --- Sanity-Check: enthält die installierte Service-Unit die wichtigsten Vars? ---
if [[ -n "${ENV_VARS[WEB_DIST]:-}" ]]; then
  if ! grep -qF "WEB_DIST=${ENV_VARS[WEB_DIST]}" "${SERVICE_TARGET}"; then
    echo "FEHLER: WEB_DIST=${ENV_VARS[WEB_DIST]} ist in ${SERVICE_TARGET}" >&2
    echo "       nicht gelandet — Service-File wurde nicht korrekt erzeugt." >&2
    exit 1
  fi
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
