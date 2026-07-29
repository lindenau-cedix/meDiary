# meDiary — Deployment & Operations

> Part of the meDiary project docs — overview & index in [CLAUDE.md](../CLAUDE.md).

The web UI is available in German and English, auto-detected from the browser
with a switcher in Settings; German remains the fallback.

## Deployment (Docker Compose)

### Production deployment

After cloning, this is enough:

```bash
docker compose up -d --build
```

Compose builds an image with the API and the built Vite frontend, and runs the
container with `restart: unless-stopped`.

**Data lives in the repo root under `./data`:**
- `./data/mediary.db` — SQLite DB
- `./data/DEFAULTS.md` — live-editable DEFAULTS file
- `./data/diary.md` — generated diary Markdown file

On first start the container copies the repository's `DEFAULTS.md` to
`./data/DEFAULTS.md` if no file exists there yet. Existing user data is not
overwritten.

**App:** <http://localhost:4000>
**Logs:** `docker compose logs -f mediary`
**Stop:** `docker compose down`
**Restart:** `docker compose restart mediary`
**Update:** `git pull && docker compose up -d --build`

Optional demo seed:

```bash
docker compose exec mediary node dist/seed.js
```

### Configuration

Optional values come from `.env` in the repo root. A template is in
`.env.example`.

| Variable | Docker default | Description |
|---|---:|---|
| `HOST_PORT` | `4000` | Host port for the app (`HOST_PORT:4000`) |
| `DB_PATH` | `/data/mediary.db` | SQLite path inside the container; Compose sets this value |
| `DEFAULTS_PATH` | `/data/DEFAULTS.md` | DEFAULTS.md inside the container; Compose sets this value |
| `DIARY_PATH` | `/data/diary.md` | Generated diary Markdown file |
| `WEB_DIST` | `/app/web/dist` | Built frontend in the image |
| `DREAM_SYSTEM_PROMPT_PATH` | `/app/system_prompt.md` | System prompt in the image |
| `TZ` | `Europe/Berlin` | Container timezone |
| `ANTHROPIC_API_KEY` | — | API key for AI diary generation (`POST /api/diary/generate`). Without a key the short version remains usable; generate → 503. |
| `DIARY_MODEL` | `claude-opus-4-8` | Model for diary generation (Anthropic: `claude-haiku-4-5` cheaper; MiniMax: e.g. `MiniMax-M2`). |
| `ANTHROPIC_BASE_URL` | `https://api.anthropic.com` | Override the API host — for MiniMax set to `https://api.minimax.io/anthropic`. |
| `DIARY_THINKING` | `adaptive` | `thinking` parameter for generation: `adaptive` \| `off` \| `<number>`. |
| `DIARY_MAX_TOKENS` | `32000` | Maximum output tokens per day. |
| `MINIMAX_API_KEY` | — | API key for nightly "dreaming" (MiniMax M3). Without a key the scheduler doesn't start. |
| `MINIMAX_BASE_URL` | `https://api.minimax.io/v1` | OpenAI-compatible endpoint. |
| `MINIMAX_MODEL` | `MiniMax-M3` | Model ID for dream generation. |
| `DREAM_THINKING` | `adaptive` | MiniMax M3 thinking: `adaptive` \| `off`. |
| `DREAM_MAX_TOKENS` | `40000` | Max output tokens per dream. |
| `DREAM_TEMPERATURE` | `0.6` | Sampling temperature for dream generation. |
| `DREAM_HTTP_TIMEOUT_MS` | `120000` | Hard timeout per MiniMax call. |
| `DREAM_TIME` | `04:20` | Time of the nightly run (HH:MM). |
| `DREAM_TZ` | `Europe/Berlin` | Timezone for dream scheduling. |
| `DREAM_SCHEDULER_DISABLED` | `false` | `true` = do not activate the in-process scheduler at startup. |
| `DREAM_CATCHUP_DAYS` | `7` | Most recent days to catch up at server startup for missing dreams. |
| `DREAM_TRIGGER_TOKEN` | — | Primary auth for `POST /api/dreams/generate` (`X-Dream-Token`). |
| `DREAM_TRUST_LOOPBACK` | `false` | `true` = accept loopback as auth; only use without a proxy/tunnel in front. |
| `DREAM_MIN_INTERVAL_MS` | `10000` | Minimum interval between two HTTP triggers. |
| `AI_LANGUAGE` | `de` | Output language for the three long-form AI generators (nightly dream, AI diary, active-ingredient profiles): `de` \| `en`. A switch marks cached ingredient profiles as stale. |
| `CF_ACCESS_TEAM_DOMAIN` | — | Cloudflare Access team for `POST /api/intakes/text`. |
| `CF_ACCESS_AUD` | — | AUD tag of the Access application. |
| `CF_ACCESS_CERTS_URL` | `<team>/cdn-cgi/access/certs` | Override of the JWKS URL. |
| `CF_ACCESS_DISABLED` | `false` | `true` = explicit bypass for local development / smoke tests. |

### Import inside the container

The importer can run as a one-off container against the same `/data` DB:

```bash
# Dry run
docker compose run --rm -v "$PWD/import:/import:ro" -e IMPORT_DIR=/import \
  mediary node dist/import.js

# Write; stopping the server briefly avoids DB locks
docker compose stop mediary
docker compose run --rm -v "$PWD/import:/import:ro" -e IMPORT_DIR=/import \
  mediary node dist/import.js --commit
docker compose start mediary
```

### Backup

Back up `./data`. For an SQLite backup:

```bash
sqlite3 ./data/mediary.db ".backup ./data/backup-$(date +%F).db"
```

### iPad app (Capacitor)

```bash
# One-time: create the Android platform
npm --prefix web run cap:android

# After every frontend update: sync + build APK
npm --prefix web run cap:sync
cd web/android && ANDROID_HOME=/path/to/sdk ./gradlew assembleDebug
```

The APK ends up at `web/android/app/build/outputs/apk/debug/app-debug.apk`.
App ID: `app.mediary`, app name: `meDiary`.

For iPad/iOS: `npx cap add ios` (macOS with Xcode required).

### Android widget "meDiary-Sample" (1×1)

The APK additionally contains a 1×1 home-screen widget. Tapping it records a
pre-configured intake via `POST /api/intakes` and shows a toast — without
opening the app. Configuration is done via the standard Android widget config
activity (system flow "Add widget" → meDiary → drag the 1×1 tile to the home
screen).

The native sources live in `web/android-native-src/` (Kotlin, layouts,
drawables, strings, manifest fragment, build script). The bundled
`install.sh` merges them into the Capacitor scaffold after `cap add android`:

```bash
# One-time per machine:
cd web
npm install
npx cap add android
./android-native-src/install.sh    # idempotent

# Web build + sync + APK:
npm run build
npm run cap:sync
cd android
ANDROID_HOME=/path/to/Sdk ./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

**Authentication:** the `CF_Authorization` cookie from the WebView cookie
manager is sent along with the POST (both as a `Cookie` header and canonically
as `Cf-Access-Jwt-Assertion`). Local deployments with `CF_ACCESS_DISABLED=true`
need no cookie. When the cookie expires (HTTP 401) the widget opens the app
(`MainActivity`) so the WebView can log in again.

**Multiple instances:** every widget instance has its own binding (substance +
amount + time-of-day slot) in `SharedPreferences("mediary_widgets")`. Any
number of tiles, each with its own tap behaviour.

**API base mirroring:** `web/src/lib/widgetBridge.ts` registers the native
`WidgetBridgePlugin`; `api.ts` calls `setApiBase()` after every `getApiBase()` /
`setApiBase()` so the widgets know the URL **before** the user has ever had to
open the app.

Details, file list, endpoint choice rationale: `web/android-native-src/README.md`
and `docs/changelog.md`.

## WhatsApp pairing & ElevenLabs voice

### Requirements
- **ffmpeg** must be available in the server image (already added as an `apt`
  package in the Dockerfile).
- A **dedicated phone number** for the WhatsApp sender account. Recommendation:
  a dedicated second SIM — Baileys is unofficial, WhatsApp can ban numbers for
  excessive use.
- **ElevenLabs API key** at https://elevenlabs.io → Profile → API Key.

### Set env variables
In `.env` (or docker-compose `environment:`):
```bash
ELEVENLABS_API_KEY=sk_...
ELEVENLABS_VOICE_ID=OO0WT3lY2gVNwzZMAjAI
ELEVENLABS_MODEL=eleven_multilingual_v2
WHATSAPP_DISABLED=false
WHATSAPP_SESSION_PATH=/data/whatsapp-session  # in Docker, ./data/whatsapp-session locally
DREAM_DELIVERY_DISABLED=false
ADMIN_UI_ENABLED=true   # only in trusted deployments!
```

### QR pairing (one-time)
1. Start the server: `docker compose up -d` (or `npm run dev` locally).
2. Open the app in the browser, go to **Settings → WhatsApp** (only visible
   with `ADMIN_UI_ENABLED=true`).
3. Click **"Show QR"** — the QR appears as soon as the server is in pairing mode.
4. On the phone: **WhatsApp → Settings → Linked devices → Add device**.
5. Scan the QR within **60 seconds** — it refreshes automatically.
6. Status switches to **"Connected"**. The `creds.json` now lives under
   `WHATSAPP_SESSION_PATH/creds.json` and survives container restarts.

### Configure recipients
At least one entry in `delivery_targets` must exist. Via the admin UI under
"Add recipient" or via SQL:
```bash
docker compose exec mediary node -e "\
  const db = require('better-sqlite3')('/data/mediary.db');\
  db.prepare('INSERT INTO delivery_targets(channel, phone, display_name, enabled, created_at) VALUES(?,?,?,1,?)').run('whatsapp','4917012345678','Me', new Date().toISOString());"
```

### Manual dream trigger (test)
```bash
docker compose exec mediary npm --prefix /app run dream -- --date=2026-07-12 --force
```
Expected: 30 s later the text and voice note arrive on WhatsApp. The status in
`dream_deliveries` is `sent` / `sent`.

### Failure recovery
- Dream was generated but WhatsApp was offline: status `failed` in
  `dream_deliveries`. Next server restart → boot sweep tries again (max 3×).
  Alternatively manually: admin UI → "Resend".
- ffmpeg missing in the container: status `sent` / `voice_status='failed'`.
  Add it to the Dockerfile, rebuild the image.
- Voice synthesis failed: status `sent` / `voice_status='failed'`. Check the
  ElevenLabs key.
