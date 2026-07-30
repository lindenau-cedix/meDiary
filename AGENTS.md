# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **`CLAUDE.md` ist ein Symlink auf `AGENTS.md`** — der Inhalt gilt für beide.

## Projektweite Konventionen

- **Auto-Commit durch das Dashboard:** Das Coding-Dashboard committet & pusht
  automatisch am Session-Ende. Niemals selbst `git add` / `git commit` /
  `git push` / `git checkout -b` ausführen — das bricht den Auto-Handoff.
  Eigene Commits würden das Dashboard-Commit verdoppeln / konkurrieren.
- **Nur der **neueste** `Letzter Durchlauf`-Block steht hier.** Ältere
  Session-Blöcke sind nach `docs/changelog.md` ausgelagert (neueste zuerst),
  damit diese Datei dauerhaft Architektur-Wissen enthält und nicht zur
  Changelog-Spiegelung wird. Bei Abschluss einer Session: aktuellen Stand
  hier anhängen + ältere Blöcke nach `docs/changelog.md` verschieben.
- **Interaktive Sessions sind erlaubt:** `AskUserQuestion` darf für offene
  Scope-Entscheidungen genutzt werden — der User wartet auf Antworten, statt
  dass Annahmen getroffen werden.

## Letzter Durchlauf (2026-07-30)

**Bilinguale UI (DE/EN) — komplette Projekt-Übersetzung + Englisch als zweite
Sprache.** Leichtgewichtiger eigener i18n-Layer (Context + `useT()` / `translate()`,
kein runtime-Dep, spiegelt den Stil aus `theme.tsx`). Default-Sprache aus
`navigator.language` mit DE-Fallback; User-Override in `localStorage["mediary.locale"]`.
`activeLocale()` als modul-lokale Variable, synchron in `setLocale` gesetzt, damit
auch nicht-React-Helper (Format, `Intl.DateTimeFormat`-Cache) den neuen Locale
sofort sehen. Dateninvarianten (Substanznamen, `nameKey()`-Locale `'de'`, `Mit:`,
`DEFAULTS.md`-Parser-Token, API-/Route-Pfade) bleiben unverändert deutsch.
- **Client-i18n-Foundation:** `web/src/lib/i18n.tsx` (`Locale`, `LOCALES`, `MessageKey`,
  `TVars`, `INTL_LOCALE = { de: 'de-DE', en: 'en-GB' }`, `I18nProvider`,
  `useI18n`, `useT`, `activeLocale`, `activeIntlLocale`, `translate`, `detectLocale`,
  `initialLocale`). `web/src/locales/{de,en}/{common,metrics}.ts` + `screens/*.ts`,
  flach gemerged über `index.ts`; `en` mit `Messages = { [K in keyof typeof de]: string }`,
  damit `as const` die deutschen Literal-Typen nicht in `en` einschmuggelt. ~295 Keys.
- **Locale-aware shared libs:** `web/src/lib/format.ts` (`formatDayLabel`/
  `formatDayShort`/`formatMonthDay`/`formatFull`/`formatEffective`/`relativeDays`/
  `greeting` routen durch `translate()`; `Intl.DateTimeFormat` gecached je Locale),
  neue Helper-Funktion `isConsumptionToday(date)` ersetzt das fehleranfällige
  `relativeDays(x) === 'heute'`-Pattern. `web/src/lib/metrics.ts` ohne
  `METRICS`-Konstante: jetzt `metricList()`, `metricLabel()`, `metricShort()`,
  `METRIC_KEYS` (locale-unabhängig). `web/src/lib/plan.ts` ohne `DAYPARTS`:
  jetzt `DAYPART_KEYS` (Tuple für Type-Narrowing), `DaypartKey`, `daypartList()`,
  `planFieldLabel()`. `web/src/lib/analytics.ts` mit `activeIntlLocale()` in zwei
  `localeCompare`-Calls; `scaleServings`/`applyProfile`/`compoundReports`/
  `equivalentFor` neutral strukturiert (Kind+Count, kein deutscher Phrasen-String).
- **Alle 9 Screens + Komponenten:** `web/src/App.tsx` wickelt `<I18nProvider>`
  um `<ThemeProvider>`, Route-Pfade bleiben deutsch (`/verlauf`, `/tagebuch` …)
  als stabile Identifier (vom Android-Widget deep-linked). `BottomNav.tsx`,
  `AssessmentSheet.tsx`, `DefaultsEditor/*`, `PageHeader.tsx`, `SentDreamsLog.tsx`,
  `SentDreamDrawer.tsx`, `AdminWhatsappPanel.tsx`, `AppShell.tsx`,
  `DreamProse.tsx`, `charts/{VBars,HBars,Punchcard,DaypartChart,DualAxis}.tsx`,
  `screens/{QuickEntry,History,Plan,Diary,Trends,Statistik,Console,Settings}*.tsx`
  — alle Strings über `useT()` / `translate()`. `index.html` mit `lang="de"` als
  Pre-Hydration-Default; `<I18nProvider>` überschreibt beim Mount.
- **Server-Lokalisierung:** `server/src/config.ts` mit `parseAiLanguage()` + neuem
  `config.aiLanguage` (`AI_LANGUAGE=de|en`, Default `de`). `server/src/lib/diary.ts`
  mit `SYSTEM_PROMPT_DE` (verbatim) + neuem `SYSTEM_PROMPT_EN`,
  `localizedSystemPrompt(lang)`, `DIARY_LABELS`, `diaryLanguageDirective`,
  `buildDayPrompt(day, lang)`, `generateDiary({ language })`. `server/src/lib/dreams.ts`
  mit `DREAM_LABELS` (de/en), `languageDirective(lang)` an System-Prompt angehängt
  (read-only `system_prompt.md` bleibt unangetastet), `Intl.DateTimeFormat` schaltet
  de-DE/en-US. `server/src/lib/ingredients.ts` mit `SYSTEM_PROMPT_DE`/`EN`,
  `localizedIngredientsSystemPrompt`, language-parameterisiertes `buildUserPrompt`,
  `analyzeSubstances({ language })`. **Wichtig:** `inputHash()` enthält
  `config.aiLanguage`, damit der Profil-Cache bei Sprachwechsel invalidiert
  (empirisch verifiziert: unterschiedliche Hashes für de/en). Alle
  API-Fehler-Strings übersetzt (`'Eine Analyse läuft bereits'` → 'An analysis
  is already running.', `'Kein Traum für diesen Tag'` → 'No dream for this day',
  `'Kein Bericht für diesen Tag'` → 'No report for this day', `'Ungültiges Datum'`
  → 'Invalid date'). Smoke gegen `/tmp/m-i18n/db.sqlite` mit `curl` grün.
- **Android-Widget:** `web/android-native-src/res/values/strings.xml` (English) +
  neues `web/android-native-src/res/values-de/strings.xml` (German). Kotlin-Dateien
  nutzen `getString(R.string.x)` mit formatierten Ressourcen; Kommentare übersetzt.
- **Doku:** `README.md`, `SAMPLES.md`, `docs/{architecture,api,deployment,
  pitfalls,development,roadmap}.md` komplett übersetzt. `docs/changelog.md`
  Zeilen 1–244 englisch; Zeilen 245+ in zwei Wellen übersetzt (Parser-Rewrite +
  Tile-Sort/Amount-Normalization/Companion/Plan-Versions/Quick-Picks). Verbleibende
  German-Vorkommen ausschließlich Daten-Invarianten (Substanznamen, Regex-Patterns,
  Datei-/API-Pfade, Sample-cURL-Bodies).
- **Verifikation:** `npm run typecheck:all` exit 0, `npm run build` (web+server)
  grün, Server-Smoke gegen `/tmp/m-i18n/db.sqlite` mit allen übersetzten
  Endpunkten erfolgreich. Verbleibende German-Vorkommen: nur Daten-Invarianten
  (Substanznamen in Backticks, Regex-Char-Klassen, API-/Datei-Pfade, cURL-Sample-
  Bodies, CLI-`console.error`/`console.log` in `server/src/dream.ts` +
  `server/src/import.ts` — diese Tools sind Operator-facing, nicht API-Responses).
  Drei letzte Server-API-Strings in der Verifikationsphase übersetzt:
  `server/src/lib/cloudflare_access.ts:145` (`'No Cloudflare Access token supplied
  (header Cf-Access-Jwt-Assertion)'`), `server/src/lib/time.ts:91`
  (`'Invalid date/time format: …'`), `server/src/routes/plan.ts:204`
  (`'Invalid date'`).

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
│   ├── src/routes/          → 14 Router (intakes, plan, dreams, chat, report, meta,
│   │                          **ingredients**, …)
│   ├── src/lib/             → 23 Module (dreams, anthropic, minimax, elevenlabs,
│   │                          whatsapp, dream_delivery, diary, chat_agent,
│   │                          **ingredients** = KI-Wirkstoff-Profile, …)
│   ├── src/index.ts         → Express-Mounts + Scheduler-Start + WhatsApp-Boot
│   ├── src/db.ts            → idempotente Schema-Migration (alle Tabellen)
│   ├── src/dream.ts         → CLI: `npm --prefix server run dream`
│   ├── src/seed.ts          → CLI: `npm --prefix server run seed`
│   └── src/import.ts        → CLI: `npm --prefix server run import`
├── web/                     → Frontend (React 18 + Vite 6 + Tailwind 3, Capacitor-fähig)
│   ├── src/screens/         → 9 Screens (QuickEntry, History, Plan, Diary, Trends, **Statistik**,
│   │                          Console, Settings, **DefaultsEditor** = `/standardnotizen`)
│   ├── src/components/      → inkl. SentDreamsLog, SentDreamDrawer, AdminWhatsappPanel,
│   │                          **charts/{VBars, HBars, Punchcard, DaypartChart, DualAxis}**,
│   │                          **DefaultsEditor/{StructuredView, SubstanceSection,
│   │                          CompanionRow, ErweitertView, AddSubstanceSheet, SaveBar}**
│   ├── src/lib/             → api.ts (Fetch-Wrapper), queries.ts (react-query Hooks), types.ts,
│   │                          **analytics.ts** (Statistik-Aggregatoren + `parseAmount`),
│   │                          **names.ts** (Client-Spiegel des Server-`nameKey()`)
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
  Server: `server/src/lib/names.ts`; Client-Spiegel: `web/src/lib/names.ts`
  (z.B. für Compliance-Badges im DEFAULTS-Editor und React-State-Vergleiche).
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
- **i18n-Dateninvarianten (NICHT übersetzen):** Substanznamen (auch in
  cURL-Sample-Bodies, Backticks, Beispiel-Strings), das `nameKey()`-Locale-Tag
  `'de'` (DARF NICHT dem aktiven UI-Locale folgen — sonst bricht Umlaut-Matching
  für `CBD-Öl` ↔ `cbd-öl`), `Mit:` / `Morgens` / `Mittags` / `Abends` / `Nachts`
  / `NACH` / `DAVOR`-Parser-Token in `DEFAULTS.md`, API-/Route-Pfade
  (`/api/intakes`, `/verlauf` …), `localStorage`-Keys (`mediary.locale`,
  `mediary.widget.*`), `Intl.Collator` / `Intl.DateTimeFormat`-Locale-Tags für
  Datums-Sortierung. Neue deutsche UI-Strings IMMER über `useT()` /
  `translate()` ergänzen und in **beide** `web/src/locales/{de,en}/*.ts`
  registrieren — die `Messages`-Typ-Definition in `en/index.ts` stellt
  sicher, dass kein Key fehlt (`typecheck:all` bricht sonst).

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
  Menge/Notiz überall gleich: expliziter Wert > DEFAULTS.md.
  **DEFAULTS.md ist die einzige Quelle für Standard-Mengen** — die DB-Spalte
  `substances.default_dose` ist entmachtet (bleibt nur fürs Undo-Snapshot-Restore
  im Schema, wird nie als Autorität gelesen/geschrieben). Beide Substanz-UIs
  schreiben ihre „Standarddosis" über `upsertSectionAmount()` verlustfrei nach
  `DEFAULTS.md` (Notiz/`Mit:`/Kommentare bleiben unangetastet); `serializeSubstance`
  liest `defaultDose` via `defaultAmountFor(name)` aus der Datei zurück.
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
  `/api/dreams/:date/redeliver`, **`PUT /api/defaults/sections`**);
  der Rest der API ist offen (privates Deployment). `CF_ACCESS_DISABLED=true` = Local-Bypass.
  Separater Token-Schutz für `POST /api/dreams/generate` (`X-Dream-Token`,
  `DREAM_TRIGGER_TOKEN`) — hinter einem Reverse-Proxy zählt
  „localhost" **nicht** als Auth.
- **Server ist der einzige Serializer von DEFAULTS.md.** Zwei Schreibpfade,
  ein Wahrheits-Eigentümer: der strukturierte Editor unter
  `/standardnotizen` ruft `PUT /api/defaults/sections` (zod-validiert, Server
  serialisiert aus dem JSON zurück in Markdown); der alte `PUT /api/defaults`
  (roher Text) bleibt offen als Power-User-Fallback — **niemals beide
  Pfade lokal parallel pflegen**, sonst gibt es Round-Trip-Drift. Beim
  Edit werden Preamble (Dokumenttitel + Intro) und nicht-strukturierte Zeilen
  (z.B. `NACH 2026-08-01 12:00 CEST: …` oder `DAVOR: …`) als
  `preLines`/`postLines` 1:1 verlustfrei übernommen — siehe
  `parseSections()` + `buildMarkdownFromParsed()` in
  `server/src/lib/defaults.ts`. Client-Mirror nur für Read-only-Parsing:
  `web/src/components/DefaultsEditor/state.ts`.
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
- **Strukturierter Editor ansehen:** `web/src/components/DefaultsEditor/`
  (`index.tsx` = Tab-Switcher + Draft-State, `StructuredView.tsx` =
  Section-Liste + Compliance-Badges, `SubstanceSection.tsx` = eine
  Substanz-Karte mit Menge/Notiz/Mit:/`preLines`/`postLines`-Disclosure,
  `CompanionRow.tsx` = autocomplete auf `useSubstances()`-Liste,
  `AddSubstanceSheet.tsx` = neues `Sheet` für QuickPick-Anlage,
  `ErweitertView.tsx` = Raw-TextArea als Power-User-Escape-Hatch,
  `SaveBar.tsx` = sticky Footer mit Dirty-Tracking,
  `state.ts` = Client-Read-only-Parser `sectionsFromRaw()` +
  `sectionsEqual()` für die „Speichern"-Enable-Logik).
  Pattern-Referenz für jede zukünftige **Section-basierte Editor-Funktion**.
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
