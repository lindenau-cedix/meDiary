# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **`CLAUDE.md` ist ein Symlink auf `AGENTS.md`** — der Inhalt gilt für beide.

# meDiary — Medikations-Tagebuch

Ein sorgfältig gestaltetes **Medikations-Tagebuch**: HTTP-API + SQLite +
React/Vite-Frontend (PC, iPad, Android-APK inkl. 1×1-Homescreen-Widget und
WhatsApp-Auslieferung der nächtlichen Auswertung). Standard-Notizen aus
`DEFAULTS.md` werden beim Eintragen automatisch übernommen. Nachtmedikation
löst ein 11-Skalen-Tagesbild aus. Plan-Versionen mit Diff. Nächtliches
„Träumen" wertet den Tag per **MiniMax M3** aus und liefert das Ergebnis
als formatierte WhatsApp-Nachricht + native Sprachnachricht (ElevenLabs
TTS, ffmpeg-Transcode zu Opus/OGG).

```
meDiary/
├── server/                  → HTTP-API (Express + TS + better-sqlite3, ESM)
│   ├── src/routes/          → 12 Router (intakes, plan, dreams, chat, report, …)
│   ├── src/lib/             → 20 Module (dreams, anthropic, minimax, elevenlabs,
│   │                          whatsapp, dream_delivery, diary, chat_agent, …)
│   ├── src/index.ts         → Express-Mounts + Scheduler-Start + WhatsApp-Boot
│   ├── src/db.ts            → idempotente Schema-Migration (alle Tabellen)
│   ├── src/dream.ts         → CLI: `npm --prefix server run dream`
│   ├── src/seed.ts          → CLI: `npm --prefix server run seed`
│   └── src/import.ts        → CLI: `npm --prefix server run import`
├── web/                     → Frontend (React 18 + Vite 6 + Tailwind 3, Capacitor-fähig)
│   ├── src/screens/         → 7 Screens (QuickEntry, History, Plan, Diary, Trends, Console, Settings)
│   ├── src/components/      → inkl. SentDreamsLog, SentDreamDrawer, AdminWhatsappPanel
│   ├── src/lib/             → api.ts (Fetch-Wrapper), queries.ts (react-query Hooks), types.ts
│   ├── android-native-src/  → Native Android-Widget-Quellen (NICHT in git getrackt;
│   │                          web/android/ ist via .gitignore ausgeschlossen und
│   │                          wird bei `cap add android` lokal generiert)
│   └── scripts/             → ensure-deps.mjs (prebuild-Guard), patch-capacitor-cli.mjs
├── import/                  → Datenquellen für den Importer (Markdown + entries.jsonl)
├── DEFAULTS.md              → Standard-Notizen/Mengen pro Substanz (live editierbar)
├── SAMPLES.md               → Zeilen-Format für den Freitext-Import (POST /api/intakes/text)
├── docs/                    → Themen-Doku (development, architecture, api, deployment,
│                              pitfalls, roadmap, changelog)
├── system_prompt.md         → System-Prompt für nächtliches Träumen (read-only)
├── README.md                → Funktionsumfang, Schnellstart, API-Übersicht
└── AGENTS.md                (du bist hier — CLAUDE.md ist ein Symlink)
```

## TL;DR

```bash
npm run install:all          # Deps (einmalig, installiert server + web)
npm run dev                  # API :4000 + Web :5173 (concurrently)
npm run typecheck:all        # Server- + Web-TS-Check (exit 0 = sauber)
npm run build                # web/dist + server/dist (für Produktion)
docker compose up -d --build # Produktionscontainer bauen + starten (inkl. ffmpeg)
```

**Stolperfallen, die du beim ersten Edit brechen kannst (lies `docs/pitfalls.md` für die volle Liste):**
- **Niemals `./data/` für Tests** — das ist das Docker-Volume mit der Live-DB.
  Smoke-Tests immer mit `DB_PATH=/tmp/mediary-test/…` gegen `/tmp` fahren.
- **`nameKey()` statt SQLite `lower()`** — `lower('Ö')` ist ASCII-only und bleibt `Ö`.
  Umlaut-Matching nur über JS `nameKey()` (`toLocaleLowerCase('de')`).
- **Tagesbericht-Default = `dreamTargetDate(now)`** — `POST /api/report/new` ohne
  Body-`date` schreibt auf den Konsum-Vortag (genau der Tag, über den 42 min
  später geträumt wird). Der 03:30-Berlin-Cron muss also nichts mitsenden.
- **Traum-Generierung ≠ Traum-UI-Update** — WhatsApp ist die Lese-Fläche,
  der Traum-Subtab in der Web-App ist nur ein Sent-Log. Traum-Generierung
  kann laufen, während WhatsApp offline ist — Delivery wird beim nächsten
  Boot automatisch nachgeholt.
- **`web/android/` ist gitignored** — Capacitor-Scaffold wird lokal generiert
  und ist nicht im Repo. Native Quellen für das Widget liegen in
  `web/android-native-src/`.

## Tech-Stack

- **Server:** Node 18+, TypeScript (ESM, `"type":"module"`), Express, better-sqlite3, zod.
  Dev: `tsx watch`, Build: `tsc → dist/`. Externe KI-Clients: `@whiskeysockets/baileys`
  (WhatsApp, QR-Pairing), `pino`, `qrcode`, `@hapi/boom`. ElevenLabs + ffmpeg nur
  via Shell (`child_process.spawn`).
- **Web:** React 18, Vite 6, Tailwind 3, framer-motion, lucide-react,
  @tanstack/react-query, react-router-dom. Build: `tsc --noEmit && vite build → web/dist`.
  Prebuild-Hook `web/scripts/ensure-deps.mjs` repariert stale `node_modules` selbst.
- **APK:** Capacitor 6 (`@capacitor/core` + `android`) plus natives 1×1-Home-Screen-Widget
  (Kotlin/OkHttp, Quellen in `web/android-native-src/`, gemergt nach
  `web/android/app/src/main/` durch `install.sh`).
- **DB:** SQLite, Schema wird idempotent in `server/src/db.ts` angelegt
  (inkl. `source_event_id` für Import-Idempotenz).
- **Tests:** **kein Test-Runner** — Verifikation läuft über
  `npm run typecheck:all` + manuelle Smoke-Tests gegen `npm run dev`
  und die API.

## Befehle

Es gibt **keinen Test-Runner**. Verifikation = `typecheck:all` + manuelle
Smoke-Tests gegen eine **Wegwerf-DB unter `/tmp`** (NIE `./data` — das ist die Live-DB).

| Zweck | Befehl |
|---|---|
| Deps installieren | `npm run install:all` |
| Dev: API :4000 + Web :5173 | `npm run dev` |
| Nur API / nur Web | `npm run dev:server` · `npm run dev:web` |
| TS-Check (Server + Web) | `npm run typecheck:all` |
| Build (Web → `web/dist`, dann Server → `server/dist`) | `npm run build` |
| Produktion (Docker, inkl. ffmpeg + WhatsApp-Session-Persistenz) | `docker compose up -d --build` |
| Seed / Import (tsx-Skripte) | `npm --prefix server run seed` · `… run import` |
| Traum für ein bestimmtes Datum / sofort / erzwungen | `npm --prefix server run dream -- [-- --date=YYYY-MM-DD] [--force]` |
| Einzelnes Skript/Modul fahren | `cd server && DB_PATH=/tmp/x/db CF_ACCESS_DISABLED=true npx tsx src/<file>.ts` |
| Android-Plattform anlegen | `cd web && npm install && npx cap add android` |
| Native Widget-Quellen mergen | `cd web && ./android-native-src/install.sh` (nach `cap add android`) |
| APK bauen | `cd web/android && ANDROID_HOME=/path/to/Sdk ./gradlew assembleDebug` |
| APK installieren | `adb install -r app/build/outputs/apk/debug/app-debug.apk` |

**Smoke-Test-Rezept** (eigener Server gegen `/tmp`, dann ein Endpunkt):

```bash
cd server && rm -rf /tmp/m && mkdir -p /tmp/m
DB_PATH=/tmp/m/db.sqlite DEFAULTS_PATH=/tmp/m/DEFAULTS.md CF_ACCESS_DISABLED=true \
  PORT=4099 DREAM_SCHEDULER_DISABLED=true npx tsx src/index.ts &
curl -s localhost:4099/api/health        # weitere Rezepte: docs/development.md

# Tagesbericht-Roundtrip (idempotenter Upsert pro Konsum-Tag):
curl -sS -X POST localhost:4099/api/report/new \
  -H 'Content-Type: application/json' \
  -d '{"report":"Coding-Session: built X, fixed Y.","source":"hermes-cron-0330"}'
curl -s 'localhost:4099/api/diary/notes'  # erscheint im Info-Subtab als „Hermes-Agent"
```

## Architektur auf einen Blick

Querschnitt-Invarianten, die mehrere Dateien betreffen (Detail-Doku in `docs/`):

- **Lokale Wanduhrzeit, kein UTC.** Zeiten sind Strings `YYYY-MM-DDTHH:mm:ss`
  (Europe/Berlin). Der **Konsum-/Medikations-Tag hat die Grenze 03:30** — Einnahmen
  00:00–03:29 zählen zum Vortag (`consumptionDay()` in `server/src/lib/time.ts`,
  serverseitig in `serializeIntake` gesetzt, NICHT im Frontend gerechnet).
- **`nameKey()` ist die einzige korrekte Substanz-Normalisierung** (umlaut-bewusst,
  `toLocaleLowerCase('de')`); SQLite `lower()` ist ASCII-only und falsch — gilt für
  Matching, Dedup und `Mit:`-Auflösung.
- **DEFAULTS.md wird pro Schreibvorgang frisch von Platte gelesen.** Auflösung von
  Menge/Notiz überall gleich: expliziter Wert > Substanz-Standarddosis > DEFAULTS.
  `Mit:`-Begleitsubstanzen werden als eigene Einnahmen miterfasst (eine Ebene tief) —
  bei `POST /api/intakes` und `/text`, NICHT bei Import/XLSX/PATCH/`plan-batch`.
- **Der Plan ist über `effective_from` versioniert** (nicht `created_at`): „welcher
  Plan galt wann". Das **Tagesbild** (11-Skalen-Assessment) wird ausgelöst, sobald
  ALLE Nacht-Medis des wirksamen Plans für den Konsumtag erfasst sind
  (`allNightMedsTaken()` in `db.ts`) — nicht schon bei einer einzelnen Nachtmed.
- **Tagesbericht des Hermes-Agents** (`POST /api/report/new`, eingeliefert vom
  03:30-Berlin-Cron) — ein Freitext-Bericht pro Konsum-Tag, was der Agent am
  Tag gemacht hat (Coding, Cron, Deploys, Fehler). Fließt an **drei** Stellen:
  (1) **Traum-Kontext** (`gatherDreamContext` in `lib/dreams.ts`) — eigene
  Sektion „Tagesbericht des Hermes-Agents" plus die jüngsten 7 Berichte, damit
  das nächtliche „Träumen" nicht nur 1–10-Skalen + Notizen kennt, sondern auch
  welche Agent-Aktivität am Tag stattfand. (2) **Tagebuch-Info-Subtab**
  (`ShortDiary` in `web/src/screens/DiaryScreen.tsx`) — eigener
  „Hermes-Agent"-Block (Lucide-Icon `Bot`, optionaler Quellenmarker); lange
  Berichte klappen hinter „Weiterlesen" zusammen (> 600 Zeichen, gleiche
  Schwelle wie Traum-Karten); Tage mit NUR einem Bericht (ohne Einnahmen /
  Tagesbild / Wachzeit) zählen als „noteworthy" und erscheinen ebenfalls.
  (3) **KI-Tagebuch-Prompt** (`buildDayPrompt` in `lib/diary.ts`) — reicht
  den Bericht an die schreibende KI weiter, damit die generierten Volltexte
  auch die Agent-Aktivität einbeziehen. Default-`date` = `dreamTargetDate(now)`
  (Konsum-Vortag) — passt zum 04:20-Traum, 03:30-Cron muss nichts mitsenden.
  Ein vorhandener Bericht zählt für `hasContent` (kein Traum-Skip mehr nur
  wegen leerer Medikations-Sektion). Tabelle: `daily_reports` (PK `date`).
- **Nächtliches „Träumen" → WhatsApp + ElevenLabs.** Der 04:20-Scheduler
  ruft `generateDream()` (unverändert, MiniMax M3), und nach erfolgreichem
  `upsertDream()` enqueued der Traum eine Delivery:
  `formatDreamForWhatsApp` (Markdown→WA-Subset, 4000-Char-Truncate) →
  `whatsapp.sendText()` + `elevenlabs.synthesize()` (MP3) →
  `ffmpeg MP3→Opus/OGG` → `whatsapp.sendVoiceNote({ptt:true})`. Text und
  Voice werden unabhängig getrackt (Tabellen `delivery_targets` +
  `dream_deliveries`, `uq_deliveries_dream_target (dream_date, target_id)`).
  Bei WhatsApp-Outage um 04:20 geht kein Traum verloren — `upsertDream`
  ist bereits committed, `retryFailedDeliveries()` versucht es beim
  nächsten Server-Start bis zu `DREAM_DELIVERY_MAX_ATTEMPTS=3` mal,
  danach `abandoned`. In-App ist nur ein **Sent-Log**
  (`SentDreamsLog` + `SentDreamDrawer`); der `DreamStartupDialog` ist
  gelöscht — WhatsApp IST die Lese-Fläche. Admin-Pairing + Testnachricht
  läuft über `AdminWhatsappPanel` (gated auf `ADMIN_UI_ENABLED=true`,
  QR-Polling alle 5s, 60s-Scan-Fenster). Baileys ist inoffiziell →
  dedizierte zweite SIM empfohlen.
- **Vier KI-Integrationen, jeweils eigener Wire-Format-Stil** (alle Keys
  ausschließlich serverseitig): KI-Tagebuch = Anthropic-Messages
  (`lib/anthropic.ts`), nächtliches „Träumen" = OpenAI-Chat-Completions
  (`lib/minimax.ts`), Daten-Konsole = Anthropic-Messages mit Tool-Loop
  + SSE (`lib/chat_agent.ts`), WhatsApp-Voice = ElevenLabs
  `text-to-speech` + ffmpeg. Alle drei LLM-Provider laufen wahlweise
  gegen MiniMax.
- **Auth = Cloudflare Access** (`lib/cloudflare_access.ts`, fail-closed),
  bewusst NUR auf mutierenden Endpunkten (`POST /api/intakes/text`,
  `/api/chat/*`-Writes, `/api/whatsapp/{qr,reconnect,test,targets}`,
  `/api/dreams/:date/redeliver`); der Rest der API ist offen (privates
  Deployment). `CF_ACCESS_DISABLED=true` = Local-Bypass. Separater
  Token-Schutz für `POST /api/dreams/generate` (`X-Dream-Token`,
  `DREAM_TRIGGER_TOKEN`) — hinter einem Reverse-Proxy zählt
  „localhost" **nicht** als Auth.
- **Android-Homescreen-Widget** (`web/android-native-src/`, gemergt nach
  `web/android/app/src/main/` durch `install.sh`) — 1×1-Kachel, Tap
  feuert `ACTION_SEND_SAMPLE`-Broadcast → `SampleSendReceiver` →
  `POST /api/intakes` → Toast. Pro Widget eine Bindung in
  `SharedPreferences("mediary_widgets")` (Substanz + Menge + Slot);
  mehrere Instanzen unabhängig. `ApiClient.attachCookie()` reicht den
  `CF_Authorization`-Cookie aus dem WebView-CookieManager als
  `Cookie:`- und `Cf-Access-Jwt-Assertion:`-Header durch. Die
  API-URL spiegelt das Web über das Capacitor-Plugin
  `WidgetBridgePlugin` in die Prefs, damit das Widget auch ohne
  vorherigen App-Start funktioniert.
- **Datenfluss Web:** `lib/api.ts` (typisierte Fetch-Wrapper) → `lib/queries.ts`
  (react-query Hooks + Query-Keys) → Screens. Server: `routes/*` →
  `lib/serialize.ts` (snake_case-Row → camelCase-DTO); Schema idempotent in `db.ts`.
  `web/src/lib/widgetBridge.ts` + der Patch in `api.ts` spiegeln die
  API-URL ins Native-Backend (WidgetBridgePlugin) bei jedem
  `getApiBase()`/`setApiBase()`.

## Wo finde ich was?

- **Neues Endpunkt-Pattern ansehen:** `server/src/routes/dreams.ts`
  (Traum-Routen inkl. Auth-Guards) oder `server/src/routes/whatsapp.ts`
  (Admin vs. open, CF-Access-`requireCloudflareAccess`).
- **Neues externes-API-Modul anlegen:** `server/src/lib/whatsapp.ts` oder
  `server/src/lib/elevenlabs.ts` als Template — beide spiegeln den Stil
  aus `minimax.ts` (typed errors, `available()`-Guard, AbortController
  + Timeout, IIFE-Numeric-Parser im `config.ts`-Block).
- **Neue DB-Tabelle:** Idempotente `CREATE TABLE IF NOT EXISTS` + Indizes
  in `server/src/db.ts` (siehe `delivery_targets`/`dream_deliveries`),
  TS-Interface daneben, Helper am Ende (idempotent via
  `INSERT OR IGNORE`).
- **Neues Frontend-Pattern:** `SentDreamsLog.tsx` +
  `SentDreamDrawer.tsx` (Status-Pills, framer-motion-Drawer, lucide-Icons,
  Tailwind-Klassen der Nacht-Palette), `AdminWhatsappPanel.tsx`
  (QR-Polling via `refetchInterval`, Mutation-Hooks, `useToast`).
- **Schlüssel-Properties der Nacht-Palette / Typografie:** siehe
  `docs/architecture.md` und die Tailwind-Config in `web/`.
  Display-Serife = Fraunces, UI = Hanken Grotesk, Mono = JetBrains
  Mono (alle drei lokal über `@fontsource-variable/*` gebündelt —
  das Web funktioniert offline in der APK).

## Detail-Dokumentation

Die ausführliche Doku ist nach Themen in `docs/` aufgeteilt — gezielt das passende
File lesen, statt alles auf einmal in den Kontext zu laden:

- **[docs/development.md](docs/development.md)** — Schnellstart, alle Kommandos,
  Verifikations-Rezepte (Smoke-Tests gegen `/tmp`, einzelne Endpunkte prüfen).
- **[docs/architecture.md](docs/architecture.md)** — Architektur-Punkte
  (Tagesgrenze 03:30, DEFAULTS live, `Mit:`-Begleitsubstanzen, Plan-Versionierung
  mit `effective_from`, Habit/Wachzeit, nächtliches „Träumen" + WhatsApp-Delivery),
  DEFAULTS-Compliance, DB-Schema, Frontend-Struktur.
- **[docs/api.md](docs/api.md)** — API-Referenz (alle Endpunkte inkl.
  `/api/intakes/text`, `/api/dreams`, `/api/whatsapp/*`, `/api/deliveries`,
  `/api/report/*`).
- **[docs/deployment.md](docs/deployment.md)** — Docker-Compose-Deployment,
  Env-Variablen, iPad/Capacitor-APK, Android-Widget-Installationsprozedur,
  **WhatsApp-Pairing + ElevenLabs-Setup**.
- **[docs/pitfalls.md](docs/pitfalls.md)** — Bekannte Stolperfallen.
  **Vor Änderungen lesen.**
- **[docs/roadmap.md](docs/roadmap.md)** — Offene Punkte / Next Steps.
- **[docs/changelog.md](docs/changelog.md)** — Chronologische Detailhistorie
  aller Sessions (nachschlagen, was wann & warum geändert wurde).
