# meDiary — Deployment & Betrieb

> Teil der meDiary-Projektdoku — Übersicht & Index in [CLAUDE.md](../CLAUDE.md).

## Deployment (Docker Compose)

### Produktiv-Deployment

Nach dem Klonen reicht:

```bash
docker compose up -d --build
```

Compose baut ein Image mit API und gebautem Vite-Frontend und startet den
Container mit `restart: unless-stopped`.

**Daten liegen im Repo-Root unter `./data`:**
- `./data/mediary.db` — SQLite-DB
- `./data/DEFAULTS.md` — live editierbare DEFAULTS-Datei
- `./data/diary.md` — generierte Tagebuch-Markdown-Datei

Beim ersten Start kopiert der Container die Repository-`DEFAULTS.md` nach
`./data/DEFAULTS.md`, falls dort noch keine Datei existiert. Bestehende
Userdaten werden nicht überschrieben.

**App:** <http://localhost:4000>
**Logs:** `docker compose logs -f mediary`
**Stoppen:** `docker compose down`
**Neu starten:** `docker compose restart mediary`
**Update:** `git pull && docker compose up -d --build`

Optionaler Demo-Seed:

```bash
docker compose exec mediary node dist/seed.js
```

### Konfiguration

Optionale Werte kommen aus `.env` im Repo-Root. Eine Vorlage liegt in
`.env.example`.

| Variable | Docker-Default | Beschreibung |
|---|---:|---|
| `HOST_PORT` | `4000` | Host-Port für die App (`HOST_PORT:4000`) |
| `DB_PATH` | `/data/mediary.db` | SQLite-Pfad im Container; Compose setzt diesen Wert fest |
| `DEFAULTS_PATH` | `/data/DEFAULTS.md` | DEFAULTS.md im Container; Compose setzt diesen Wert fest |
| `DIARY_PATH` | `/data/diary.md` | Generierte Tagebuch-Markdown-Datei |
| `WEB_DIST` | `/app/web/dist` | Gebautes Frontend im Image |
| `DREAM_SYSTEM_PROMPT_PATH` | `/app/system_prompt.md` | System-Prompt im Image |
| `TZ` | `Europe/Berlin` | Container-Zeitzone |
| `ANTHROPIC_API_KEY` | — | API-Key für die KI-Tagebuch-Generierung (`POST /api/diary/generate`). Ohne Key bleibt die Kurzversion nutzbar; Generieren → 503. |
| `DIARY_MODEL` | `claude-opus-4-8` | Modell für die Tagebuch-Generierung (Anthropic: `claude-haiku-4-5` günstiger; MiniMax: z. B. `MiniMax-M2`). |
| `ANTHROPIC_BASE_URL` | `https://api.anthropic.com` | Override des API-Hosts — für MiniMax auf `https://api.minimax.io/anthropic` setzen. |
| `DIARY_THINKING` | `adaptive` | `thinking`-Parameter der Generierung: `adaptive` \| `off` \| `<zahl>`. |
| `DIARY_MAX_TOKENS` | `32000` | Maximale Output-Tokens pro Tag. |
| `MINIMAX_API_KEY` | — | API-Key für das nächtliche „Träumen" (MiniMax M3). Ohne Key läuft der Scheduler nicht an. |
| `MINIMAX_BASE_URL` | `https://api.minimax.io/v1` | OpenAI-kompatibler Endpunkt. |
| `MINIMAX_MODEL` | `MiniMax-M3` | Modell-ID für die Traum-Generierung. |
| `DREAM_THINKING` | `adaptive` | MiniMax-M3-Thinking: `adaptive` \| `off`. |
| `DREAM_MAX_TOKENS` | `40000` | Max. Output-Tokens je Traum. |
| `DREAM_TEMPERATURE` | `0.6` | Sampling-Temperatur der Traum-Generierung. |
| `DREAM_HTTP_TIMEOUT_MS` | `120000` | Harter Timeout je MiniMax-Call. |
| `DREAM_TIME` | `04:20` | Uhrzeit des nächtlichen Laufs (HH:MM). |
| `DREAM_TZ` | `Europe/Berlin` | Zeitzone der Traumplanung. |
| `DREAM_SCHEDULER_DISABLED` | `false` | `true` = In-Process-Scheduler beim Start nicht aktivieren. |
| `DREAM_CATCHUP_DAYS` | `7` | Jüngste Tage, die beim Serverstart auf fehlende Träume nachgeholt werden. |
| `DREAM_TRIGGER_TOKEN` | — | Primäres Auth für `POST /api/dreams/generate` (`X-Dream-Token`). |
| `DREAM_TRUST_LOOPBACK` | `false` | `true` = Loopback als Auth akzeptieren; nur ohne Proxy/Tunnel davor verwenden. |
| `DREAM_MIN_INTERVAL_MS` | `10000` | Mindestabstand zwischen zwei HTTP-Triggern. |
| `CF_ACCESS_TEAM_DOMAIN` | — | Cloudflare-Access-Team für `POST /api/intakes/text`. |
| `CF_ACCESS_AUD` | — | AUD-Tag der Access-Application. |
| `CF_ACCESS_CERTS_URL` | `<team>/cdn-cgi/access/certs` | Override der JWKS-URL. |
| `CF_ACCESS_DISABLED` | `false` | `true` = expliziter Bypass für lokale Entwicklung/Smoke-Tests. |

### Import Im Container

Der Importer kann als Einmal-Container gegen dieselbe `/data`-DB laufen:

```bash
# Dry-Run
docker compose run --rm -v "$PWD/import:/import:ro" -e IMPORT_DIR=/import \
  mediary node dist/import.js

# Schreiben; Server kurz stoppen vermeidet DB-Locks
docker compose stop mediary
docker compose run --rm -v "$PWD/import:/import:ro" -e IMPORT_DIR=/import \
  mediary node dist/import.js --commit
docker compose start mediary
```

### Backup

`./data` sichern. Für ein SQLite-Backup:

```bash
sqlite3 ./data/mediary.db ".backup ./data/backup-$(date +%F).db"
```

### iPad-App (Capacitor)

```bash
# Einmalig: Android-Plattform anlegen
npm --prefix web run cap:android

# Nach jedem Frontend-Update: sync + APK bauen
npm --prefix web run cap:sync
cd web/android && ANDROID_HOME=/path/to/sdk ./gradlew assembleDebug
```

Das APK liegt in `web/android/app/build/outputs/apk/debug/app-debug.apk`.
App-ID: `app.mediary`, App-Name: `meDiary`.

Für iPad/iOS: `npx cap add ios` (macOS mit Xcode erforderlich).

### Android-Widget „meDiary-Sample" (1×1)

Die APK enthält zusätzlich ein 1×1-Home-Screen-Widget. Tippen erfasst
eine vorkonfigurierte Einnahme per `POST /api/intakes` und blendet
einen Toast ein — ohne dass die App geöffnet wird. Konfiguration
über die Android-Standard-Widget-Config-Activity (System-Flow „Widget
hinzufügen" → meDiary → 1×1-Kachel auf den Homescreen ziehen).

Die nativen Quellen liegen in `web/android-native-src/` (Kotlin,
Layouts, Drawables, Strings, Manifest-Fragment, Build-Skript). Sie
werden vom mitgelieferten `install.sh` nach `cap add android` in das
Capacitor-Scaffold gemergt:

```bash
# Einmalig pro Maschine:
cd web
npm install
npx cap add android
./android-native-src/install.sh    # idempotent

# Web-Build + Sync + APK:
npm run build
npm run cap:sync
cd android
ANDROID_HOME=/path/to/Sdk ./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

**Authentifizierung:** Der `CF_Authorization`-Cookie aus dem
WebView-CookieManager wird beim POST mitgeschickt (sowohl als
`Cookie`-Header als auch kanonisch als `Cf-Access-Jwt-Assertion`).
Lokale Deployments mit `CF_ACCESS_DISABLED=true` brauchen keinen
Cookie. Bei abgelaufenem Cookie (HTTP 401) öffnet das Widget die App
(`MainActivity`), damit der WebView sich neu einloggt.

**Mehrere Instanzen:** Jede Widget-Instanz hat eine eigene Bindung
(Substanz + Menge + Tageszeit-Slot) in `SharedPreferences("mediary_widgets")`.
Beliebig viele Kacheln, jede mit eigenem Tap-Verhalten.

**API-Base spiegeln:** `web/src/lib/widgetBridge.ts` registriert das
native `WidgetBridgePlugin`; `api.ts` ruft `setApiBase()` nach jedem
`getApiBase()`/`setApiBase()` auf, damit die Widgets die URL kennen,
**bevor** der Nutzer die App jemals öffnen musste.

Details, Datei-Liste, Endpoint-Wahl-Begründung:
`web/android-native-src/README.md` und `docs/changelog.md`.

## WhatsApp-Pairing & ElevenLabs-Voice

### Voraussetzungen
- **ffmpeg** muss im Server-Image verfügbar sein (im Dockerfile bereits als `apt`-Paket ergänzt).
- Eine **eigene Telefonnummer** für den WhatsApp-Sender-Account. Empfehlung: dedizierte zweite SIM — Baileys ist inoffiziell, WhatsApp kann Nummern bei übermäßiger Nutzung sperren.
- **ElevenLabs-API-Key** unter https://elevenlabs.io → Profile → API Key.

### Env-Variablen setzen
In `.env` (oder docker-compose `environment:`):
```bash
ELEVENLABS_API_KEY=sk_...
ELEVENLABS_VOICE_ID=OO0WT3lY2gVNwzZMAjAI
ELEVENLABS_MODEL=eleven_multilingual_v2
WHATSAPP_DISABLED=false
WHATSAPP_SESSION_PATH=/data/whatsapp-session  # in Docker, ./data/whatsapp-session lokal
DREAM_DELIVERY_DISABLED=false
ADMIN_UI_ENABLED=true   # nur in trusted Deployments!
```

### QR-Pairing (einmalig)
1. Server starten: `docker compose up -d` (oder `npm run dev` lokal).
2. Im Browser die App öffnen, in den **Einstellungen → WhatsApp** gehen (nur sichtbar mit `ADMIN_UI_ENABLED=true`).
3. Auf **„QR anzeigen"** klicken — der QR erscheint, sobald der Server im Pairing-Modus ist.
4. Auf dem Telefon: **WhatsApp → Einstellungen → Verknüpfte Geräte → Gerät hinzufügen**.
5. QR innerhalb von **60 Sekunden** scannen — erneuert sich automatisch.
6. Status wechselt auf **„Verbunden"**. Die `creds.json` liegt jetzt unter `WHATSAPP_SESSION_PATH/creds.json` und überlebt Container-Restarts.

### Empfänger konfigurieren
Mindestens ein Eintrag in `delivery_targets` muss existieren. Über die Admin-UI unter „Empfänger hinzufügen" oder per SQL:
```bash
docker compose exec mediary node -e "\
  const db = require('better-sqlite3')('/data/mediary.db');\
  db.prepare('INSERT INTO delivery_targets(channel, phone, display_name, enabled, created_at) VALUES(?,?,?,1,?)').run('whatsapp','4917012345678','Me', new Date().toISOString());"
```

### Manueller Dream-Trigger (Test)
```bash
docker compose exec mediary npm --prefix /app run dream -- --date=2026-07-12 --force
```
Erwartet: 30 s später kommen Textnachricht + Sprachnachricht auf WhatsApp an. Der Status in `dream_deliveries` ist `sent`/`sent`.

### Failure-Recovery
- Traum wurde generiert, aber WhatsApp war offline: Status `failed` in `dream_deliveries`. Nächster Server-Restart → Boot-Sweep versucht erneut (max 3×). Alternativ manuell: Admin-UI → „Erneut senden".
- ffmpeg fehlt im Container: Status `sent` / `voice_status='failed'`. Im Dockerfile ergänzen, Image neu bauen.
- Sprach-Synthese fehlt: Status `sent` / `voice_status='failed'`. ElevenLabs-Key prüfen.
