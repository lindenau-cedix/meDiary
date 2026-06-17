# meDiary — Deployment & Betrieb

> Teil der meDiary-Projektdoku — Übersicht & Index in [CLAUDE.md](../CLAUDE.md).

## Deployment (systemd, kein Docker)

### Produktiv-Deployment auf dem Host

```bash
npm run deploy        # baut + installiert nach ~/mediary + startet systemd service
```

Ablauf von `deploy.sh`:
1. `build.sh` → Frontend + Backend kompilieren → `build/`-Verzeichnis
2. Bestehenden Service stoppen (falls aktiv)
3. `build/` → `~/mediary` spiegeln
4. `mediary.service` → `~/.config/systemd/user/`
5. `systemctl --user daemon-reload && enable --now mediary`

**Daten** (liegen immer in `~/.local/share/mediary/`, nicht im Repo):
- `~/.local/share/mediary/data/mediary.db` — SQLite-DB
- `~/.local/share/mediary/DEFAULTS.md` — DEFAULTS-Datei

**Logs:** `journalctl --user-unit=mediary -f`
**Stoppen:** `systemctl --user stop mediary`
**Neu starten:** `systemctl --user restart mediary`

### Server-Konfiguration (Env-Variablen)

| Variable | Default | Beschreibung |
|---|---|---|
| `PORT` | `4000` | HTTP-Port |
| `DB_PATH` | `~/.local/share/mediary/data/mediary.db` | SQLite-Pfad |
| `DEFAULTS_PATH` | `~/.local/share/mediary/DEFAULTS.md` | DEFAULTS.md-Pfad |
| `WEB_DIST` | _(auto)_ | Gebautes Web-Frontend für statische Auslieferung. Ohne Env wird ein neben dem Build liegendes `web/dist` (`SERVER_ROOT/web/dist`) **automatisch erkannt** — `deploy.sh` setzt zusätzlich `./web/dist` als Default, sodass `GET /` nach `npm run deploy` zuverlässig funktioniert (kein „Cannot GET /"). |
| `ANTHROPIC_API_KEY` | — | API-Key für die KI-Tagebuch-Generierung (`POST /api/diary/generate`). Ohne Key bleibt die Kurzversion nutzbar; Generieren → 503. |
| `DIARY_MODEL` | `claude-opus-4-8` | Modell für die Tagebuch-Generierung (Anthropic: `claude-haiku-4-5` günstiger; MiniMax: z. B. `MiniMax-M2`). |
| `ANTHROPIC_BASE_URL` | `https://api.anthropic.com` | Override des API-Hosts — **für ein MiniMax-Abo** auf `https://api.minimax.io/anthropic` setzen (Anthropic-kompatibler Endpunkt, normaler API-Key, kein OAuth). |
| `DIARY_THINKING` | `adaptive` | `thinking`-Parameter der Generierung: `adaptive` (gültig für Anthropic Opus 4.6+/Sonnet 4.6 UND MiniMax) \| `off`/`none`/`disabled` (weglassen) \| `<zahl>` = `budget_tokens` für ältere Modelle. |
| `DIARY_MAX_TOKENS` | `32000` | Maximale Output-Tokens pro Tag — großzügig, damit adaptives Denken + der kurze Tagebuchtext nicht abgeschnitten werden. Bei MiniMax-Modellen mit niedrigerem Limit herabsetzen. |
| `DIARY_PATH` | `~/.local/share/mediary/diary.md` | Pfad der generierten Tagebuch-Markdown-Datei. |
| `MINIMAX_API_KEY` | — | API-Key für das nächtliche „Träumen" (MiniMax M3). Ohne Key läuft der Scheduler nicht an; `POST /api/dreams/generate` → 503. |
| `MINIMAX_BASE_URL` | `https://api.minimax.io/v1` | OpenAI-kompatibler Endpunkt (`POST {baseUrl}/chat/completions`). |
| `MINIMAX_MODEL` | `MiniMax-M3` | Modell-ID für die Traum-Generierung. |
| `DREAM_THINKING` | `adaptive` | `thinking`-Switch für M3 — laut MiniMax-Doku NUR `adaptive` (Default, an) \| `off`/`disabled`/`none`/`false`/`0` (→ `{type:disabled}`, explizit gesendet). KEIN `budget_tokens` (das ist Anthropic-only, siehe `DIARY_THINKING`). |
| `DREAM_MAX_TOKENS` | `40000` | Max. Output-Tokens je Traum (M3-Reasoning fällt ins Budget). Leere Antwort mit `finish_reason=length` → klarer „erhöhen"-Fehler. |
| `DREAM_TEMPERATURE` | `0.6` | Sampling-Temperatur der Traum-Generierung. |
| `DREAM_HTTP_TIMEOUT_MS` | `120000` | Harter Timeout je MiniMax-Call (AbortController). Verhindert, dass ein hängender Call das Träumen dauerhaft blockiert. |
| `DREAM_TIME` | `04:20` | Uhrzeit des nächtlichen Laufs (HH:MM, lokale Zeit = Europe/Berlin, DST-sicher). |
| `DREAM_TZ` | `Europe/Berlin` | Zeitzone (informativ; Host läuft in Europe/Berlin). |
| `DREAM_SCHEDULER_DISABLED` | `false` | `true` = In-Process-Scheduler beim Start nicht aktivieren (z. B. wenn ein externer Cron triggert). |
| `DREAM_CATCHUP_DAYS` | `7` | Jüngste Tage, die beim Serverstart auf fehlende Träume nachgeholt werden (0 = aus). Fängt Neustarts über 04:20 + nachgetragene Daten ab. |
| `DREAM_TRIGGER_TOKEN` | — | **Primäres Auth** für `POST /api/dreams/generate` (`X-Dream-Token`-Header, konstantzeit verglichen). Pflicht für externe/Cron-Trigger — hinter cloudflared/Proxy ist Loopback KEINE Auth. |
| `DREAM_TRUST_LOOPBACK` | `false` | `true` = Loopback (127.0.0.1, via `socket.remoteAddress`) als Auth akzeptieren. NUR für reine Nur-lokal-Deployments OHNE Proxy/Tunnel davor. Default fail-closed. |
| `DREAM_MIN_INTERVAL_MS` | `10000` | Mindestabstand zwischen zwei Generierungen über den HTTP-Trigger (Rate-Limit gegen Token-Kosten-Missbrauch → 429). |
| `DREAM_SYSTEM_PROMPT_PATH` | _(auto)_ | Override des `system_prompt.md`-Pfads (Default: cwd → neben dem Build → Repo-Root; frisch je Generierung gelesen). |
| `CF_ACCESS_TEAM_DOMAIN` | — | Cloudflare-Access-Team („meinteam", „meinteam.cloudflareaccess.com" oder volle URL) — schützt `POST /api/intakes/text` |
| `CF_ACCESS_AUD` | — | AUD-Tag der Access-Application (Zero Trust → Access → Applications) |
| `CF_ACCESS_CERTS_URL` | `<team>/cdn-cgi/access/certs` | Override der JWKS-URL (nur für Tests nötig) |
| `CF_ACCESS_DISABLED` | `false` | `true` = expliziter Bypass für lokale Entwicklung/Smoke-Tests |

### iPad-App (Capacitor)

```bash
# Einmalig: Android-Plattform anlegen
npm --prefix web run cap:add-android

# Nach jedem Frontend-Update: sync + APK bauen
npm --prefix web run cap:sync
cd web/android && ANDROID_HOME=/path/to/sdk ./gradlew assembleDebug
```

Das APK liegt in `web/android/app/build/outputs/apk/debug/app-debug.apk`.
App-ID: `app.mediary`, App-Name: `meDiary`.

Für iPad/iOS: `npx cap add ios` (macOS mit Xcode erforderlich).

### Update流程

1. `npm run deploy` im Repo → baut neuen Stand, spiegelt nach `~/mediary`, restart
2. DB in `~/.local/share/mediary/` bleibt unberührt
3. DEFAULTS.md: wird von `start.sh` beim ersten Start nach `~/.local/share/mediary/` kopiert; danach live editierbar über die Web-UI
