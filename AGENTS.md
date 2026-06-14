# AGENTS.md — meDiary

Schnell-Einstieg für eine andere KI (Claude Code, Hermes o. ä.), die dieses
Projekt nahtlos weiterbearbeitet.

## Was ist meDiary?

Ein sorgfältig gestaltetes **Medikations-Tagebuch**: HTTP-API + SQLite +
React/Vite-Frontend (PC, iPad, Android-APK). Standard-Notizen aus
`DEFAULTS.md` werden beim Eintragen automatisch übernommen. Nachtmedikation
löst ein 11-Skalen-Tagesbild aus. Plan-Versionen mit Diff.

```
meDiary/
├── server/   → HTTP-API (Express + TypeScript + better-sqlite3)
├── web/      → Frontend (React + Vite + Tailwind, Capacitor-fähig)
├── import/   → Datenquellen für den Importer (Markdown + entries.jsonl)
├── DEFAULTS.md  → Standard-Notizen/Mengen pro Substanz (live editierbar)
├── SAMPLES.md   → Zeilen-Format für den Freitext-Import (POST /api/intakes/text)
├── README.md
└── AGENTS.md    (du bist hier — CLAUDE.md ist ein Symlink auf diese Datei)
```

## Tech-Stack

- **Server:** Node 18+, TypeScript (ESM), Express, better-sqlite3, zod.
  Dev: `tsx watch`, Build: `tsc → dist/`.
- **Web:** React 18, Vite 6, Tailwind 3, framer-motion, lucide-react,
  @tanstack/react-query, react-router-dom. Build: `vite build → web/dist`.
- **APK:** Capacitor 6 (`@capacitor/core` + `android`).
- **DB:** SQLite, Schema wird idempotent in `server/src/db.ts` angelegt
  (inkl. `source_event_id` für Import-Idempotenz).
- **Tests:** keine Unit-Tests vorhanden — Verifikation läuft über manuelle
  Smoke-Tests gegen `npm run dev` und die API.

## Schnellstart & Kommandos

```bash
npm run install:all    # server/ und web/ installieren
npm --prefix server run seed     # 6 Substanzen + 2 Plan-Versionen + Einnahmen
npm run dev            # API :4000, Web :5173 (Proxy /api → 4000)
```

Weitere Kommandos (kein Linter konfiguriert, kein Test-Runner — Verifikation
siehe Rezepte unten):

```bash
npm --prefix server run build    # tsc → server/dist
npm run start                    # node dist/index.js (vorher build)
npm run build:web                # tsc --noEmit + vite build → web/dist
npm --prefix server run import               # Importer Dry-Run (liest import/)
npm --prefix server run import -- --commit   # schreibt in die DB (--reset-imported ersetzt Importiertes)
npm run cap:android              # Capacitor: android/ anlegen + syncen (in web/: cap:sync, cap:open)
```

Server-Konfiguration über Env/`.env` (`server/src/config.ts`): `PORT` (4000),
`DB_PATH`, `DEFAULTS_PATH`, `WEB_DIST`. Defaults (wenn keine Env gesetzt):
- `DB_PATH` → `~/.local/share/mediary/data/mediary.db`
- `DEFAULTS_PATH` → `~/.local/share/mediary/DEFAULTS.md`
- `WEB_DIST` → wird nicht gesetzt (API läuft solo)

**`.env`-Datei**: Vorlage in `.env.example`. Alle dort dokumentierten Vars
(`WEB_DIST`, `PORT`, `DB_PATH`, `DEFAULTS_PATH`, `CF_ACCESS_*`) werden beim
`npm run deploy` aus `.env` gelesen und in den systemd-Service injected —
damit lassen sich Deployment-Parameter ändern, ohne die Service-Datei manuell
zu editieren. `.env` ist in `.gitignore`.

**systemd-Deployment** (kein Docker):
```bash
npm run deploy        # liest .env → baut + installiert nach ~/mediary + startet systemd service
npm run build         # nur bauen (~/mediary/build/)
```

Die DB liegt **außerhalb des Installationsverzeichnisses** in
`~/.local/share/mediary/` — ein Update des Codes via `npm run deploy`
berührt die Daten nicht.

## Wichtige Architektur-Punkte

- **DEFAULTS.md wird bei JEDEM Schreibvorgang frisch gelesen** (kein Cache).
  Parser: `server/src/lib/defaults.ts → parse()`. Unterstützt `Menge:`/
  `Dosis:`, `Notiz:`/`Hinweis:` und `Mit:`/`Zusammen mit:` (Begleitsubstanz,
  Format `Mit: Name | Menge | Notiz`, Menge/Notiz optional, mehrere Zeilen
  möglich); Fließtext unter einer `## …`-Überschrift zählt als Notiz.
  Case-insensitive Match via `nameKey()` (Unicode-aware,
  `toLocaleLowerCase('de')`).
- **Begleitsubstanzen (`Mit:`)**: `POST /api/intakes` erfasst für jede
  `Mit:`-Zeile der eingetragenen Substanz automatisch eine zweite Einnahme —
  gleicher Zeitpunkt, in einer Transaktion mit dem Haupteintrag. Menge/Notiz
  aus der `Mit:`-Zeile haben Vorrang, sonst Standarddosis bzw. eigener
  DEFAULTS-Eintrag der Begleitsubstanz. Nur eine Ebene tief (`Mit:` der
  Begleitsubstanz wird nicht verfolgt, Selbstbezug übersprungen),
  Autovivifikation wie beim Haupteintrag, `source_event_id =
  companion:<haupt-id>`. Ist die Begleitsubstanz Nachtmedikation, wird das
  Tagesbild ausgelöst. **`POST /api/intakes/text` macht dasselbe** pro Eintrag
  (ohne Tagesbild-Feld). Gilt NICHT für Importer/XLSX-Import/PATCH/plan-batch;
  Request-Flag `companions: false` schaltet es pro Aufruf ab.
- **Substanz-Autovivifikation** (`server/src/lib/substances.ts`):
  - `findOrCreateSubstance(name)` wird in `POST /api/intakes` aufgerufen,
    wenn ein `substanceName` ohne `substanceId` ankommt → legt die Substanz
    bei Bedarf an, damit sie als QuickPick erscheint.
  - `backfillSubstancesFromIntakes()` läuft beim **Serverstart** und am
    Ende von `import.ts --commit`. Verknüpft Einnahmen ohne `substance_id`
    rückwirkend mit ihrer Substanz (oder legt sie neu an).
  - `nameKey()` normalisiert Unicode-aware — `CBD-Öl` und `cbd-öl` matchen.
    `SQLite lower()` ist ASCII-only und wird hier umgangen.
- **Tagesgrenze 03:30 Europe/Berlin** (`server/src/lib/time.ts → DAY_BOUNDARY`).
  Einnahmen 00:00–03:29 zählen zum Vortag. **Server** (`consumptionDay()`
  in `db.ts`/`time.ts`) UND **Frontend** (`web/src/lib/time.ts`, gleicher
  Algorithmus) kennen die Grenze. Konsequenz: `intake.date` im JSON
  (gesendet von `serializeIntake`) IST der Konsum-Tag; die Heute-Liste
  im QuickEntryScreen filtert lokal `it.date === consumptionToday()`,
  damit die 03:30-Grenze in beide Richtungen sicher greift (der
  SQL-`from/to`-Filter arbeitet auf Wand­uhr-Zeit). `allNightMedsTaken`
  in `db.ts` sucht für Konsum-Tag `day` im Wand­uhr-Bereich
  `dayT03:30:00` … `(day+1)T03:29:59`, sodass das Tagesbild exakt
  passend zu `consumptionDay(takenAt)` ausgelöst wird. `formatDayLabel`
  und `relativeDays` im Frontend vergleichen gegen `consumptionToday()`,
  nicht den Wand­uhr-Tag — eine 02:30-Einnahme erscheint in der
  Verlauf-Liste als „Gestern" (Konsum-Tag), nicht als „Heute"
  (Wand­uhr-Tag).
- **Composer-Zeitstempel bleibt nach Submit stehen** — `takenAt` wird
  nur beim erstmaligen Mount des QuickEntry-Bildschirms per
  `useState(nowLocalInput())` auf "jetzt" gesetzt. Nach erfolgreichem
  Eintrag (auch Sammel-Eintrag „Morgendmedis"/„Nachtmedis") bleiben
  `takenAt`/`amount`/`note` des Haupt-Eintrags erhalten, sodass
  mehrere Substanzen mit demselben Zeitpunkt hintereinander erfasst
  werden können. Erst ein erneuter Besuch des Heute-Tabs (oder ein
  Klick auf den „Jetzt"-Button) setzt den Zeitpunkt neu.
- **Plan-Versionierung** ist ein vollständiger Snapshot pro Version. Der
  `plan_items`-Datensatz hat `version_id` und `substance_id` (NULL = freier Name).
- **Wirkungszeitpunkt `effective_from`** (`plan_versions`, `YYYY-MM-DD` oder
  `YYYY-MM-DDTHH:mm`): Plan-Änderungen können **rückwirkend** („seit X Tagen ist
  schon Y anders") oder **in der Zukunft** („in X Tagen wird Y anders") erfasst
  werden — unabhängig vom Erfassungszeitpunkt `created_at`. Ein reines Datum gilt
  ab 00:00; der lexikografische String-Vergleich ordnet beide Formate korrekt
  (`"2026-06-11" < "2026-06-11T08:00"`). `planVersionAt(at)` in `server/src/db.ts`
  löst über `effective_from <= Zeitpunkt` auf (Tie-Break: höhere `id` gewinnt
  bei gleichem Wert); `at = null` heißt „jetzt" (volle aktuelle Zeit), ein reines
  Datum als Stichtag wird als **Tagesende** interpretiert („welcher Plan galt an
  diesem Tag"). `upcomingPlanVersions()` vergleicht gegen die aktuelle Zeit —
  eine Version „heute 23:50" bleibt bis dahin `upcoming`. Migration: idempotent
  in `db.ts` (`ensureColumn` + Backfill `effective_from = substr(created_at,1,10)`).

## API-Referenz (Auszug)

| Methode | Pfad | Zweck |
|---|---|---|
| `GET` | `/api/health` | Status |
| `GET` | `/api/metrics` | 11 Tages-Skalen |
| `GET/POST` | `/api/substances` | Substanzen lesen / anlegen |
| `PATCH/DELETE` | `/api/substances/:id` | ändern / archivieren (`?hard=true` löscht) |
| `POST` | `/api/substances/reorder` | Kachel-Reihenfolge setzen (`{ ids: number[] }` → `sort_order = Index`) |
| `GET/POST` | `/api/intakes` | Einnahmen (DEFAULTS-Logik, Autovivifikation) |
| `POST` | `/api/intakes/plan-batch` | alle Plan-Substanzen eines Slots auf einmal eintragen („Morgendmedis"/„Nachtmedis", `{ slot, takenAt? }`) |
| `POST` | `/api/intakes/text` | mehrzeiligen Freitext (Format: SAMPLES.md) in Einnahmen umwandeln — **Cloudflare-Access-geschützt**, mit DB-Verifikation in der Antwort |
| `PATCH/DELETE` | `/api/intakes/:id` | ändern / löschen |
| `GET` | `/api/plan` | heute wirksamer Plan + `upcoming` (geplante Zukunfts-Versionen) |
| `GET` | `/api/plan/at?date=…` \| `?days=N` | Plan zum Stichtag/Zeitpunkt (`date` auch `YYYY-MM-DDTHH:mm`) |
| `GET` | `/api/plan/diff?days=N` | Plan-Diff |
| `GET` | `/api/plan/versions` | Versions-Verlauf (sortiert nach Wirkungsdatum, mit `active`/`upcoming`-Flags) |
| `PUT` | `/api/plan` | neue Plan-Version; optional `effectiveFrom: "YYYY-MM-DD"` oder `"YYYY-MM-DDTHH:mm"` (rückwirkend/zukünftig, Default heute) |
| `GET` | `/api/assessments?from=&to=` | Tagesbilder (Trends) |
| `GET/PUT/DELETE` | `/api/assessments/:date` | Tagesbild lesen / speichern / löschen |
| `GET/PUT` | `/api/defaults` | DEFAULTS.md lesen / schreiben |
| `GET` | `/api/defaults/check` | DEFAULTS-Compliance-Bericht |

`POST /api/intakes` liefert `{ intake, nightMed, assessmentDate, assessmentExists, createdSubstance, companions }` — `createdSubstance: true` heißt, der Name war neu und wurde als QuickPick angelegt; `companions` (`{ intake, createdSubstance }[]`) sind die automatisch miterfassten Begleit-Einnahmen aus `Mit:`-Defaults (leer, wenn keine).

`POST /api/intakes/plan-batch` (`{ slot: "morning"|"noon"|"evening"|"night", takenAt? }`) trägt **alle** Substanzen des zum `takenAt` wirksamen Plans ein, die im jeweiligen Slot eine Dosis haben — die Sammel-Einträge „Morgendmedis" (morning) und „Nachtmedis" (night) im Heute-Tab. Pro Substanz gilt dieselbe Auflösung wie bei `POST /` (Menge: Standarddosis > DEFAULTS > Plan-`strength`; Notiz aus DEFAULTS), Autovivifikation inklusive (`source_event_id = planbatch:<slot>`). Begleitsubstanzen (`Mit:`) werden hier bewusst NICHT miterfasst (der Plan ist die maßgebliche Liste; sonst Doppelungen). Antwort: `{ slot, count, entries: { intake, createdSubstance }[], nightMed, assessmentDate, assessmentExists }`. Wie bei `POST /` löst auch hier das Komplettieren aller Nacht-Medis das Tagesbild aus.

`POST /api/intakes/text` (Body: JSON `{ text, dryRun?, companions? }` oder direkt `text/plain`) wandelt mehrzeiligen Freitext in Einnahmen um. Format pro Zeile siehe **SAMPLES.md** im Projekt-Root: optionales Präfix `DD.MM(.YYYY) HH:MM:` (ohne Jahr = aktuelles, ohne Datum = heute), nur `HH:MM:`, `jetzt:` oder gar kein Präfix (= aktuelle Zeit); danach Einträge `Substanz Menge (Notiz)`, getrennt durch Kommas und/oder „ und " (Dezimal-Kommas wie `0,5 ml` und Klammer-Inhalte trennen nicht). Menge beginnt beim ersten Zahl-Token nach dem Namen (bei Folgen wie „Omega 3 500 mg" beim letzten der Zahlen-Folge); **Menge und/oder Notiz dürfen weggelassen werden — dann greifen die DEFAULTS.md-Werte** (Menge: Text > Standarddosis > DEFAULTS; Notiz: Klammer > DEFAULTS-Notiz). Autovivifikation wie bei `POST /`. **`Mit:`-Begleitsubstanzen aus DEFAULTS.md werden — wie bei `POST /` — pro Eintrag automatisch als eigene Einnahme zum selben Zeitpunkt miterfasst** (z. B. Theanin → Lemon Balm), eine Ebene tief, Selbstbezug übersprungen, `source_event_id = companion:<haupt-id>`; `companions: false` im JSON-Body schaltet das ab. Jede Zeile wird einzeln verarbeitet und ist atomar — ein fehlerhafter Eintrag macht die ganze Zeile zum `lineErrors`-Element, die übrigen Zeilen werden trotzdem angelegt (alle Inserts einer Anfrage in einer Transaktion, `source_event_id = text:<Zeitstempel>` als Batch-Marker für die Haupteinträge). **Nach dem Schreiben liest der Endpunkt die Einträge (inkl. Begleitsubstanzen) frisch aus der DB** und meldet, welche wirklich angekommen sind. Antwort (201): `{ batchId, lineCount, requested, created, verified, entries: { line, createdSubstance, verified, intake, companions: { createdSubstance, verified, intake }[] }[], lineErrors: { line, text, error }[] }` — `requested` zählt die Haupteinträge, `created` alle verifizierten Einträge (Haupt + Begleit), `verified` ist genau dann true, wenn jeder geplante Insert in der DB gefunden wurde. 400, wenn gar kein Eintrag parsebar war; `dryRun: true` liefert nur das Parse-Ergebnis (mit Begleit-Vorschau `entries[].companions[]`) ohne zu schreiben. **Zugriffsschutz:** Cloudflare Access (siehe Env-Tabelle) — ohne Konfiguration antwortet der Endpunkt 503 (fail-closed), `CF_ACCESS_DISABLED=true` ist der Dev-Bypass.

**Kurzreferenz `/api/intakes/text` für externe Clients:** Lokal/Smoke-Test mit
`CF_ACCESS_DISABLED=true`; produktiv über die Cloudflare-Access-geschützte URL
aufrufen (Login-Cookie oder Service-Token am Cloudflare-Edge; am Origin wird
das daraus entstehende JWT aus `Cf-Access-Jwt-Assertion` bzw. `CF_Authorization`
validiert). Vor echten Writes erst `dryRun: true` senden. Beispiel:

```bash
curl -sS -X POST "$MEDIARY_URL/api/intakes/text" \
  -H 'Content-Type: application/json' \
  -d '{"dryRun":true,"text":"12.06.2026 08:30: Elvanse 30mg (nüchtern), Lithium 300 mg\njetzt: Theanin"}'
```

Für den echten Import `dryRun` weglassen; wenn keine automatischen
`Mit:`-Begleitsubstanzen angelegt werden sollen, `{ "companions": false }`
mitsenden. `text/plain` funktioniert ebenfalls:

```bash
curl -sS -X POST "$MEDIARY_URL/api/intakes/text" \
  -H 'Content-Type: text/plain' \
  --data-binary $'08:30: Elvanse 30mg (nuechtern)\njetzt: Theanin'
```

## DEFAULTS-Compliance — Checker & UI

`GET /api/defaults/check` liefert:

```json
{
  "checkedAt": "2026-06-10T...",
  "defaultsAvailable": true,
  "total": 9,
  "compliant": [{ "name": "Lithium", "intakeCount": 12, "inSubstances": true, "hasDefault": true, "matchedKey": "lithium" }],
  "missing":   [{ "name": "Mirtazapin", "intakeCount": 3, "inSubstances": true, "hasDefault": false, "matchedKey": null }]
}
```

Sortierung: fehlende zuerst, dann nach Einnahme-Häufigkeit, dann alphabetisch.
Frontend-UI:

- `web/src/screens/QuickEntryScreen.tsx` zeigt eine **Warnkarte** oben, wenn
  Substanzen ohne DEFAULTS-Eintrag existieren; betroffene Kacheln bekommen
  ein kleines `AlertCircle`-Badge in der oberen linken Ecke.
- `web/src/screens/SettingsScreen.tsx` hat eine neue Sektion
  **„Prüfung: DEFAULTS.md"** mit Badges („X mit Eintrag", „Y ohne Eintrag")
  und einer Liste der fehlenden Substanzen. Jeder Eintrag hat einen
  **„Eintrag"-Button**, der `## <Name>\nNotiz: \n` in den DEFAULTS-Editor
  einfügt und den Cursor dorthin springen lässt (Toast/Focus-Scroll).
- Beim Speichern der DEFAULTS-Datei (`useSaveDefaults`) wird der
  Compliance-QueryKey invalidiert; die UI aktualisiert sich automatisch.

## Datenbank-Schema (SQLite)

| Tabelle | Zweck |
|---|---|
| `substances` | antippbare Liste (Farbe, Standarddosis, `is_night_med`, Reihenfolge via `sort_order`, Soft-Archive via `archived_at`) |
| `intakes` | Einnahmen (Zeitpunkt, Substanz-Snapshot mit `substance_id` + `substance_name`, Menge, Notizen) |
| `plan_versions` | Plan-Snapshots (`created_at` = erfasst, `effective_from` = gültig ab) |
| `plan_items` | Plan-Zeilen (Morgens/Mittags/Abends/Nachts) je Version |
| `daily_assessments` | Tagesbild (11 Skalen als JSON, Primärschlüssel `date`) |

Indices: `idx_intakes_taken_at`, `idx_intakes_source` (Import-Idempotenz),
`idx_plan_items_version`, `idx_plan_versions_source`, `idx_plan_versions_effective`.

## Frontend-Struktur

```
web/src/
├── App.tsx                 # Router + Theme + QueryClient
├── main.tsx
├── screens/
│   ├── QuickEntryScreen.tsx    # Heute: Composer + Kachel-Raster + Tagesbild
│   ├── HistoryScreen.tsx       # Verlauf nach Tagen gruppiert
│   ├── PlanScreen.tsx          # Medikationsplan + Verlauf + Diff
│   ├── TrendsScreen.tsx        # 11 Skalen-Trends (SVG)
│   └── SettingsScreen.tsx      # Theme, Substanzen, Server, DEFAULTS.md, Compliance
├── components/                 # UI-Bausteine (Sheet, Card, Button, Toaster, …)
├── lib/
│   ├── api.ts                  # fetch-Wrapper + ApiError
│   ├── queries.ts              # react-query-Hooks
│   ├── types.ts                # API-Typen
│   ├── time.ts                 # DAY_BOUNDARY, consumptionDay, consumptionToday, parseLocal, nowLocalInput
│   ├── format.ts               # re-exportiert time-Helfer, greeting, formatTime, formatDayLabel, …
│   ├── colors.ts, theme.tsx    # Design-Tokens / Theme-Persistenz
│   └── haptics.ts, native.ts   # Capacitor-Haptik
└── index.css                   # CSS-Variablen, Tailwind-Layer
```

## Verifikations-Rezepte (was man nach Änderungen prüfen sollte)

Nach jeder Änderung an Server oder Import-Logik:

```bash
# 1. Bauen + Typcheck
cd server && npx tsc --noEmit        # muss exit 0
cd ../web && npx tsc --noEmit        # muss exit 0

# 2. E2E-Smoke gegen eine Scratch-DB in /tmp — niemals gegen ./data im
#    Projekt-Root (Docker-Volume mit Live-Daten) oder server/data testen!
cd ../server && rm -rf /tmp/mediary-test && mkdir -p /tmp/mediary-test
PORT=4011 DB_PATH=/tmp/mediary-test/mediary.db DEFAULTS_PATH=../DEFAULTS.md node_modules/.bin/tsx src/seed.ts
PORT=4011 DB_PATH=/tmp/mediary-test/mediary.db DEFAULTS_PATH=../DEFAULTS.md node_modules/.bin/tsx src/index.ts &

# DEFAULTS-Compliance:
curl -sS http://localhost:4011/api/defaults/check | jq

# Autovivifikation: ein Intake mit neuem Namen anlegen
curl -sS -X POST http://localhost:4011/api/intakes -H 'Content-Type: application/json' \
  -d '{"substanceName":"Mirtazapin","amount":"15 mg"}'
# → createdSubstance: true, neue Substanz im /api/substances-Listing

# DEFAULTS wirkt:
curl -sS -X POST http://localhost:4011/api/intakes -H 'Content-Type: application/json' \
  -d '{"substanceId":<id-von-cbd-öl>}'
# → notes wird aus DEFAULTS.md übernommen

# Rückwirkende/zukünftige Plan-Version:
curl -sS -X PUT http://localhost:4011/api/plan -H 'Content-Type: application/json' \
  -d '{"effectiveFrom":"<gestern>","note":"rückwirkend","items":[{"substanceName":"Lithium","strength":"600 mg"}]}'
# → sofort aktueller Plan; mit effectiveFrom in der Zukunft stattdessen:
#   GET /api/plan → alte Version + upcoming[], GET /api/plan/at?date=<zukunft> → neue Version

# Freitext-Import (Server dafür mit CF_ACCESS_DISABLED=true starten):
curl -sS -X POST http://localhost:4011/api/intakes/text -H 'Content-Type: application/json' \
  -d '{"text":"11.06.2026 08:30: Elvanse 30mg (nüchtern), Lithium 300 mg und Vitamin D 20000 IE\njetzt: Theanin"}'
# → 201, verified:true, entries[] mit frisch aus der DB gelesenen Einträgen;
#   dryRun:true im Body parst nur. Ohne CF_ACCESS_DISABLED/-Konfig → 503,
#   mit CF_ACCESS_TEAM_DOMAIN+CF_ACCESS_AUD aber ohne/mit ungültigem JWT → 401.

# 3. Frontend-Bau
cd ../web && node_modules/.bin/vite build   # dist/ entsteht
```

## Letzte Änderungen (jüngste zuerst)

- **Tagesgrenze 03:30 Europe/Berlin im Frontend + Datum bleibt nach Submit**:
  - **Server `consumptionDay()` als Wahrheit für `intake.date`** —
    `serializeIntake` (`server/src/lib/serialize.ts`) berechnet `date`
    jetzt über `consumptionDay(taken_at)` (DAY_BOUNDARY) statt
    `slice(0, 10)`. Einnahmen 00:00–03:29 haben damit ein um einen
    Tag zurückverschobenes `date`.
  - **Server `allNightMedsTaken(day)` repariert** (`server/src/db.ts`):
    die DB-Suche verwendet jetzt den Wand­uhr-Bereich
    `dayT03:30:00` … `(day+1)T03:29:59` — d. h. genau die
    Einnahmen, deren `consumptionDay(takenAt) === day`. Vorher
    suchte `dayT00:00:00` … `dayT23:59:59`, was das
    03:30-Grenzverhalten nicht abdeckte (Einnahme um 02:30
    konsumtechnisch zum Vortag, aber vom Suchbereich nicht
    erfasst). Konsequenz: das Tagesbild wird jetzt zuverlässig
    ausgelöst, wenn die letzte Nacht-Med-Einnahme vor 03:30
    erfolgte.
  - **Frontend `web/src/lib/time.ts`** (neu) spiegelt den
    Server-Helfer: `DAY_BOUNDARY`, `consumptionDay`,
    `consumptionToday`, `consumptionTodayOffset(n)`,
    `nowLocalInput`, `parseLocal`, `toDateString`. `format.ts`
    re-exportiert diese Helfer, sodass alte Aufrufer von
    `todayStr`/`nowLocalInput`/`parseLocal`/`dateNDaysAgo` aus
    `format.ts` weiter funktionieren.
  - **`formatDayLabel`/`relativeDays` benutzen `consumptionToday()`**
    statt `todayStr()` — eine Einnahme um 02:30 erscheint in
    der Verlauf-Liste als „Gestern" (Konsum-Tag), nicht als
    „Heute" (Wand­uhr-Tag).
  - **QuickEntryScreen (`today = consumptionToday()`)** plus
    lokaler Filter `it.date === today` aus den letzten 2
    Konsum-Tagen. Robust gegen die SQL-`from/to`-Heuristik
    (die weiter auf Wand­uhr-Zeit arbeitet).
  - **Composer `takenAt` bleibt nach Submit stehen** —
    `resetComposer()` setzt nur `selectedId`/`amount`/`note`
    zurück, nicht mehr `takenAt`. Initial `useState(nowLocalInput())`
    beim Mount, „Jetzt"-Button setzt ihn explizit zurück. Damit
    können mehrere Substanzen eines Blocks („Morgendmedis" oder
    nachts) ohne erneutes Stellen der Uhr erfasst werden.
  - Verifiziert: Server-TS, Web-TS, Server-Build (`tsc`), Vite-Build
    je exit 0; E2E gegen `/tmp`-Scratch-DB: `02:30` → date=Vortag,
    `03:29` → Vortag, `03:30` → aktueller Tag, `03:31` → aktueller
    Tag; Plan-Batch `night @ 22:00` (Konsum-Tag = gleicher Tag) und
    `night @ 02:30` (Konsum-Tag = Vortag) lösen das Tagesbild für
    den jeweils korrekten Konsum-Tag aus; PATCH mit
    `takenAt=01:00` setzt `date` ebenfalls auf Vortag. Live-`./data`
    unberührt.

- **Dokumentation: Mehrzeiltextinput-API erklärt**:
  - Keine Code-/Schemaänderung. Die bestehende Route `POST /api/intakes/text`
    wurde gegen Implementierung und `SAMPLES.md` geprüft und in dieser Datei
    um eine kurze Nutzungsreferenz mit `curl`-Beispielen für JSON, `dryRun`,
    `companions: false`, `text/plain` und Cloudflare-Access-Hinweise ergänzt.
- **Freitext-Import (`/text`): `Mit:`-Begleitsubstanzen + Menge/Notiz-Weglassen**:
  - `POST /api/intakes/text` erfasst jetzt — wie `POST /` — pro Eintrag die
    `Mit:`-Begleitsubstanzen aus DEFAULTS.md automatisch mit (z. B. Theanin →
    Lemon Balm „100 mg" + Mit:-Notiz). Gleicher Zeitpunkt wie der Haupteintrag,
    eine Ebene tief, Selbstbezug übersprungen, `source_event_id =
    companion:<haupt-id>`. Vorher waren sie hier bewusst ausgeschlossen — diese
    Entscheidung ist auf Wunsch umgekehrt. `companions: false` im JSON-Body
    schaltet es pro Aufruf ab.
  - **Menge und/oder Notiz dürfen im Text weggelassen werden** → es greifen die
    DEFAULTS.md-Werte (war bereits so: Text-Menge > Standarddosis > DEFAULTS;
    Text-Notiz > DEFAULTS-Notiz). Jetzt verifiziert.
  - **Verifikation deckt Begleiteinträge mit ab**: der Endpunkt liest nach dem
    Commit ALLE IDs (Haupt + Begleit) frisch aus der DB. Antwort-`entries[]`
    bekommen ein verschachteltes `companions: { createdSubstance, verified,
    intake }[]`; `created` zählt alle verifizierten Einträge (Haupt + Begleit),
    `requested` weiter nur die Haupteinträge, `verified` (gesamt) true gdw.
    jeder geplante Insert gefunden wurde. `dryRun` zeigt eine read-only
    Begleit-Vorschau (`previewCompanions` in `routes/intakes.ts`, keine
    Substanz-Anlage).
  - Verifiziert: Server-TS + Server-Build je exit 0; E2E gegen `/tmp`-Scratch-DB:
    dryRun-Vorschau Theanin→Lemon Balm (100 mg + Mit:-Notiz); Real-Run
    „jetzt: Theanin" → Theanin 400 mg (DEFAULTS, Menge weggelassen) + Lemon Balm
    `companion:<id>`, beide `verified`, `created:2 requested:1`; Mehrfach-Zeile
    (Companion hängt nur an Theanin, nicht an Elvanse/Lithium) mit atomarer
    Fehlerzeile; `companions:false` → kein Lemon Balm; Live-`./data` unberührt.
- **Freitext-Import `POST /api/intakes/text` + Cloudflare-Access-Schutz**:
  - **Parser `server/src/lib/text_entries.ts`** (`parseFreeText`): mehrzeiliger
    Freitext nach SAMPLES.md → Einträge. Pro Zeile optionales Präfix
    `DD.MM(.YYYY) HH:MM:` / `HH:MM:` / `jetzt:` / keins (= jetzt; ohne Jahr =
    aktuelles Jahr, ohne Datum = heute; nur Datum = aktuelle Uhrzeit an jenem
    Tag); Einträge `Substanz Menge (Notiz)` getrennt durch Kommas/„ und " auf
    Klammertiefe 0 (Dezimal-Kommas `0,5` trennen nicht). Menge = erster
    Zahl-Token nach dem Namen, bei Zahl-Folgen („Omega 3 500 mg") der letzte
    der Folge; reine Mengen ohne Name („300mg") sind Fehler. Kalender-echte
    Datums-/Zeitvalidierung (31.02. / 25:99 → Zeilen-Fehler). Eine Zeile ist
    atomar: ein unparsbarer Eintrag → ganze Zeile in `lineErrors`, übrige
    Zeilen laufen weiter (gefahrloses erneutes Senden korrigierter Zeilen).
  - **Route `POST /api/intakes/text`** (`server/src/routes/intakes.ts`): Body
    JSON `{ text, dryRun?, companions? }` oder `text/plain`. Auflösung je
    Eintrag wie `POST /` (Text-Menge > Standarddosis > DEFAULTS; Text-Notiz >
    DEFAULTS-Notiz — **Menge/Notiz dürfen weggelassen werden, dann greifen die
    DEFAULTS**), Autovivifikation inklusive. **`Mit:`-Begleitsubstanzen werden
    pro Eintrag automatisch miterfasst** (wie bei `POST /`; z. B. Theanin →
    Lemon Balm), eine Ebene tief, Selbstbezug übersprungen, `source_event_id =
    companion:<haupt-id>`; `companions: false` schaltet das ab. Haupteinträge
    in einer Transaktion, `source_event_id = text:<Zeitstempel>` als
    Batch-Marker. **Verifikation: nach dem Commit liest der Endpunkt alle IDs
    (Haupt + Begleit) frisch aus der DB** und antwortet mit `verified` pro
    Eintrag, pro Begleiteintrag und gesamt (`{ batchId, lineCount, requested,
    created, verified, entries: { …, companions[] }[], lineErrors[] }`;
    `requested` = Haupteinträge, `created` = alle verifizierten). `dryRun`
    parst nur (inkl. read-only Begleit-Vorschau `previewCompanions`). 400, wenn
    nichts parsebar.
  - **Cloudflare Access (`server/src/lib/cloudflare_access.ts`)**: Middleware
    `requireCloudflareAccess` validiert das von Cloudflare an den Origin
    gereichte JWT (`Cf-Access-Jwt-Assertion`-Header, alternativ
    `CF_Authorization`-Cookie) komplett in `node:crypto` (keine neue
    Dependency): RS256-Signatur gegen die Team-JWKS
    (`<team>/cdn-cgi/access/certs`, 10-min-Cache, Frisch-Abruf bei
    unbekannter kid für Key-Rotation), `aud` = AUD-Tag, `iss` = Team-Domain,
    `exp`/`nbf` mit 30 s Toleranz. Service-Tokens (CF-Access-Client-Id/
    -Secret) prüft Cloudflare am Edge — am Origin kommt auch dafür ein JWT
    an. Fail-closed: ohne `CF_ACCESS_TEAM_DOMAIN`+`CF_ACCESS_AUD` → 503;
    `CF_ACCESS_DISABLED=true` = expliziter Dev-Bypass. Neue Env-Variablen
    siehe Tabelle (Server-Konfiguration). Kein UI-Anteil — der Endpunkt ist
    für externe Automationen (Telegram-Bot, Shortcuts, …) gedacht.
  - Verifiziert: Server-/Web-TS, Server-Build, Vite-Build je exit 0; E2E gegen
    `/tmp`-Scratch-DB (dryRun ohne Schreiben; 7/7 Einträge erstellt+verifiziert
    inkl. DEFAULTS-Menge Theanin, DEFAULTS-Notiz CBD, `30mg`→`30 mg`,
    Dezimal-Komma, „Omega 3 500 mg"-Heuristik, 3 Fehlerzeilen; kein
    Lemon-Balm-Companion; text/plain-Body; 400 bei nur-Fehler-Text; 503 ohne
    CF-Konfig; 401 ohne Token / Müll-Token / manipulierte Signatur / falsche
    Audience / abgelaufen; 201 mit gültigem JWT via Header und via Cookie
    gegen lokalen Test-JWKS).
- **Sammel-Einträge „Morgendmedis" / „Nachtmedis"**:
  - Neuer Endpunkt `POST /api/intakes/plan-batch` (`server/src/routes/intakes.ts`):
    trägt mit einem Aufruf alle Substanzen des zum `takenAt` wirksamen Plans
    ein, die im gewünschten Slot (`morning`/`noon`/`evening`/`night`) eine Dosis
    haben — in einer Transaktion, gleicher Zeitpunkt. Menge/Notiz pro Substanz
    wie bei `POST /` (Standarddosis > DEFAULTS > Plan-`strength`; Notiz aus
    DEFAULTS). Autovivifikation pro Plan-Substanz (`createdSubstance`-Flag je
    Eintrag), `source_event_id = planbatch:<slot>`. **Keine** `Mit:`-Begleit­
    substanzen (Plan ist die maßgebliche Liste, sonst Doppelungen). Dedup
    gleicher Namen innerhalb eines Slots via `nameKey`. Nach dem Eintragen
    greift `allNightMedsTaken(consumptionDay(takenAt))` → `nightMed`/
    `assessmentDate` lösen das Tagesbild aus (so öffnet sich nach „Nachtmedis"
    der Abfragedialog). Antwort: `{ slot, count, entries: { intake,
    createdSubstance }[], nightMed, assessmentDate, assessmentExists }`.
  - **Frontend (`web/src/screens/QuickEntryScreen.tsx`):** zwei Sammel-Kacheln
    `PlanBatchTile` („Morgendmedis"/„Nachtmedis") am Anfang des Substanz-Rasters
    — nur sichtbar, wenn der aktuelle Plan (`usePlan()`) für den Slot überhaupt
    Substanzen hat (`morningCount`/`nightCount`). Ein Tipp ist eine Sofort-
    Aktion (keine Auswahl-/Bestätigungsleiste): trägt alles zum Composer-
    `takenAt` ein, Toast mit Substanz-Liste + „Rückgängig" (löscht alle
    erzeugten Einnahmen). Nach „Nachtmedis" öffnet sich bei
    `nightMed && !assessmentExists` das Tagesbild. Neue Mutation
    `useIntakeMutations().planBatch` (invalidiert `substances`/Compliance, wenn
    eine Plan-Substanz neu angelegt wurde); API-Client `api.intakes.planBatch`;
    Typen `PlanSlot`/`PlanBatchEntry`/`PlanBatchResult` (`lib/types.ts`).
- **Menge-Normalisierung: Zahl + Buchstabe bekommt Leerzeichen**:
  - `normalizeAmount()` fügt automatisch ein Leerzeichen zwischen Ziffer
    und Buchstabe ein (`100ml` → `100 ml`, `50mg` → `50 mg`).
  - Wirkt an allen Stellen, wo `amount` entsteht: `POST /api/intakes`,
    `PATCH /api/intakes/:id`, `POST /api/substances`, `PATCH /api/substances/:id`,
    DEFAULTS.md-Parser (`Menge:` + `Mit:`), Begleitsubstanzen.
  - Regex: `(\d)([a-zA-ZäöüÄÖÜßµ])` → `$1 $2` — deckt mg, ml, µg etc. ab.
- **Kachel-Reihenfolge im „Heute"-Tab sortierbar**:
  - Backend war bereits vollständig vorhanden (`sort_order`-Spalte,
    `POST /api/substances/reorder`, `ORDER BY sort_order, name`, API-Client
    `api.substances.reorder`, `useSubstanceMutations().reorder`) — es fehlte
    nur die Bedien-UI.
  - **Frontend (`web/src/screens/QuickEntryScreen.tsx`):** neuer
    „Sortieren"-Modus (Toggle neben „Verwalten", ab 2 Substanzen). Im Modus
    wird das Kachel-Raster durch eine vertikale Drag-Liste ersetzt
    (framer-motion `Reorder` + `useDragControls`, Zieh-Griff `GripVertical`) —
    bewusst 1D-Liste statt 2D-Grid-Drag, um Konflikte mit der
    Tap-/Long-Press-Geste der Kacheln zu vermeiden. Neue Reihenfolge wird
    debounced (500 ms) via `reorder.mutate(ids)` automatisch gespeichert;
    „Fertig" und ein `useEffect`-Cleanup beim Verlassen flushen eine noch
    ausstehende Speicherung. Wiederabruf passiert serverseitig über
    `ORDER BY sort_order` (kein Client-State nötig).
- **Begleitsubstanzen via DEFAULTS `Mit:`**:
  - Neue DEFAULTS-Zeile `Mit: <Name> | <Menge> | <Notiz>` (Aliase
    `Zusammen mit:`/`With:`; Menge/Notiz optional, mehrere Zeilen möglich).
    Parser: `CompanionDefault[]` als neues Feld `companions` in
    `SubstanceDefault` (`lib/defaults.ts`).
  - `POST /api/intakes` legt Begleit-Einnahmen im selben Schritt an
    (Transaktion): gleicher `taken_at`, Autovivifikation, Fallback auf
    Standarddosis/eigene DEFAULTS der Begleitsubstanz, `source_event_id =
    companion:<haupt-id>`. Keine Ketten/Zyklen (eine Ebene, Selbstbezug
    übersprungen). `companions: false` im Request schaltet es ab (Backfill).
    Antwort: neues Feld `companions: { intake, createdSubstance }[]`;
    `nightMed` ist auch dann true, wenn erst die Begleitsubstanz
    Nachtmedikation ist (Tagesbild-Trigger).
  - Importer, XLSX-Import und `PATCH /api/intakes/:id` bleiben unberührt.
  - **Frontend:** Composer-Vorschau „Automatisch dazu: …" bei Substanzen mit
    `Mit:`-Defaults; Toast nennt Begleit-Einträge (`+ Name`) und „Rückgängig"
    löscht Haupt- + Begleit-Einnahmen; `useIntakeMutations().create`
    invalidiert `substances`/Compliance, wenn eine Begleitsubstanz neu
    angelegt wurde. Hilfetext + Placeholder im DEFAULTS-Editor erweitert.
- **`effective_from` mit optionaler Uhrzeit**:
  - `effective_from` akzeptiert jetzt auch `YYYY-MM-DDTHH:mm`; reines Datum
    gilt weiter ab Tagesbeginn (keine Migration nötig, String-Vergleich ordnet
    beide Formate korrekt).
  - `planVersionAt(at)` vergleicht zeitpunktgenau: `null` = „jetzt", reines
    Datum = Tagesende des Stichtags. `upcomingPlanVersions()` und das
    `upcoming`-Flag in `/api/plan/versions` vergleichen gegen die aktuelle
    Zeit statt nur den Tag.
  - `PUT /api/plan` validiert `effectiveFrom` als Datum oder Datetime;
    `GET /api/plan/at?date=` akzeptiert auch `YYYY-MM-DDTHH:mm`.
  - **Frontend (`PlanScreen.tsx`):** optionales Uhrzeit-Feld neben „Gültig ab"
    (leer = Tagesbeginn); Hinweistext rechnet minutengenau (rückwirkend /
    heute um HH:MM / geplant). Neue Helfer `formatEffective()` und
    `effectiveTimeOf()` in `lib/format.ts`; `relativeDays()` toleriert
    Datetime-Strings. Anzeige der Uhrzeit in Header, „Geplante Änderung",
    Versions-Verlauf und Snapshot-Sheet.
- **Rückwirkende / zukünftige Plan-Änderungen**:
  - Neue Spalte `plan_versions.effective_from` (Wirkungsdatum, YYYY-MM-DD) mit
    idempotenter Migration + Backfill aus `created_at` in `db.ts`.
  - `planVersionAt()` löst jetzt über das Wirkungsdatum auf; „aktueller Plan"
    = heute wirksame Version (Zukunfts-Versionen zählen noch nicht).
  - `PUT /api/plan` akzeptiert optional `effectiveFrom` (Vergangenheit oder
    Zukunft); `GET /api/plan` liefert zusätzlich `upcoming[]`;
    `GET /api/plan/versions` sortiert nach Wirkungsdatum und liefert
    `effectiveFrom`/`active`/`upcoming` (Feld `date` = Wirkungsdatum).
  - Seed und Importer setzen `effective_from = Tag von created_at`.
  - **Frontend (`PlanScreen.tsx`):** „Gültig ab"-Datumsfeld im Plan-Editor mit
    Hinweistext (rückwirkend / heute / geplant); Karte „Geplante Änderung" über
    dem Plan; Versions-Verlauf zeigt „gültig ab" + Badges „aktuell"/„geplant";
    `SnapshotSheet` lädt jetzt direkt per `GET /api/plan/version/:id` (statt
    Stichtags-Umweg). `relativeDays()` kennt zusätzlich „morgen".
- **Automatische Substanz-QuickPicks + DEFAULTS-Compliance**:
  - `POST /api/intakes` legt unbekannte Namen als QuickPick an
    (`findOrCreateSubstance`, `createdSubstance`-Flag in der Antwort).
  - `backfillSubstancesFromIntakes()` läuft beim Serverstart und nach
    `import.ts --commit` — koppelt Einnahmen ohne `substance_id` an
    vorhandene/neu angelegte Substanzen.
  - Unicode-aware Matching über `nameKey()` (`toLocaleLowerCase('de')`) —
    wichtig für deutsche Umlaute (`CBD-Öl` ↔ `cbd-öl`).
  - `GET /api/defaults/check` liefert vollständigen Compliance-Bericht
    (`compliant` + `missing`).
  - **Frontend:** Warnkarte auf dem Heute-Bildschirm + Warn-Icon auf
    betroffenen Kacheln; neue Sektion „Prüfung: DEFAULTS.md" in den
    Einstellungen mit „Eintrag"-QuickAdd in den DEFAULTS-Editor.
- **Bestehende Features** (siehe README): versionierter Plan, 11 Tages-Skalen,
  Android-APK, Markdown-Importer, Light/Dark-Mode „Apotheken"-Design.

## Offene Punkte / Next Steps

- [ ] Unit-Tests für `lib/defaults.ts` (Parser) und `lib/substances.ts`
      (`nameKey`, `findOrCreateSubstance`, `backfill…`).
- [ ] `Hash`-basierte Erkennung echter Konflikte: aktuell unterscheidet
      der Compliance-Check nicht „absichtlich ohne Default" von
      „noch nicht gepflegt". Eine bewusste Ausnahme-Liste (z. B. eine
      spezielle `Notiz: -` in DEFAULTS) wäre eine Option.
- [ ] `IntakeEditSheet` zeigt beim Editieren keinen DEFAULTS-Preview an
      (nur im `QuickEntryScreen` Composer). Konsistenz ggf. angleichen.
- [ ] Die `nameKey`-Migration für bestehende Dubletten (z. B. „CBD-Öl" +
      „cbd-öl" aus alten Importen) ist nicht automatisch — die DB bleibt
      ggf. mit zwei Substanzen. Bei Bedarf manuell mergen via
      SubstanceManager oder direkt in der DB.
- [ ] Geplante (zukünftige) Plan-Versionen lassen sich nicht löschen oder
      nachträglich bearbeiten (kein `DELETE /api/plan/version/:id`) — wer
      sich vertan hat, muss eine weitere Version mit gleichem Wirkungsdatum
      speichern (höhere `id` gewinnt). UI-Aktion „geplante Version
      verwerfen" wäre ein sinnvoller nächster Schritt.
- [ ] Der Plan-Editor bearbeitet immer den **heute aktiven** Stand als
      Ausgangsbasis — beim Anlegen einer Zukunfts-Version wäre die jüngste
      geplante Version als Vorlage ggf. praktischer.

## Bekannte Stolperfallen

- **Zwei `data/`-Verzeichnisse:** `./data` im Projekt-Root ist das
  Docker-Volume mit der **Live-DB** — nie löschen oder für Tests verwenden.
  `server/data` ist der lokale Dev-Default (`DB_PATH` relativ zu `server/`).
  Smoke-Tests immer mit explizitem `DB_PATH` nach `/tmp` fahren.
- **SQLite `lower()` ist ASCII-only** — `lower('Ö')` bleibt `Ö`. Für
  korrektes Umlaut-Matching ist `nameKey()` in JS Pflicht; keine
  `lower(name) = lower(?)` Queries mehr schreiben.
- **DEFAULTS.md wird live eingelesen** — keine Notwendigkeit, den Server
  nach einer Änderung neu zu starten, aber auch keine Reload-Logik im
  Client nötig (Server liest pro Anfrage frisch).
- **`Mit:`-Begleitsubstanzen gelten für `POST /api/intakes` UND
  `POST /api/intakes/text`** — Importer, XLSX-Replace und PATCH legen bewusst
  keine Begleit-Einnahmen an (Historie bleibt Historie); `plan-batch` ebenso
  nicht (Plan ist die maßgebliche Liste). Es wird genau eine Ebene aufgelöst:
  `Mit:`-Zeilen der Begleitsubstanz werden ignoriert, `Mit: <Substanz selbst>`
  ebenso. Eine per `Mit:` referenzierte Substanz ohne eigenen `## …`-Abschnitt
  taucht nach dem ersten Auto-Eintrag im Compliance-Check als `missing` auf —
  gewollt (Aufforderung, sie zu pflegen). Bei `/text` gibt es KEINE
  Querschnitt-Deduplizierung: nennt eine Zeile die Begleitsubstanz zusätzlich
  selbst (z. B. „Theanin, Lemon Balm"), entstehen zwei Lemon-Balm-Einträge
  (Haupt + Begleit) — wie zwei getrennte `POST /`-Aufrufe; `companions: false`
  unterdrückt die automatischen.
- **`plan-batch` erfasst genau die Plan-Substanzen des Slots** — keine
  `Mit:`-Begleitsubstanzen (sonst Doppelungen, wenn eine Begleitsubstanz
  ohnehin im Plan steht). Maßgeblich ist der zum `takenAt` wirksame Plan; eine
  Substanz, die morgens UND nachts dosiert ist (z. B. Lithium), wird von beiden
  Sammel-Einträgen je einmal erfasst (zwei Einnahmen, gewollt). Im Frontend
  erscheinen die Kacheln nur, wenn der Plan für den Slot etwas vorsieht.
- **`/api/intakes/text` ist der einzige authentifizierte Endpunkt** — der
  Rest der API ist bewusst offen (privates Deployment). Die CF-Access-Prüfung
  ist fail-closed: ohne `CF_ACCESS_TEAM_DOMAIN`+`CF_ACCESS_AUD` → 503. Für
  lokale Smoke-Tests `CF_ACCESS_DISABLED=true` setzen. `Mit:`-Begleit­
  substanzen werden hier — anders als früher — miterfasst (wie bei `POST /`,
  abschaltbar mit `companions: false`); kein `nightMed`/Tagesbild-Feld in der
  Antwort (externe Automation, keine UI). Wiederholtes Senden desselben Texts
  erzeugt Duplikate — es gibt bewusst keine Idempotenz (`source_event_id =
  text:<Zeitstempel>` ist nur ein Batch-Marker zum Wiederfinden/Aufräumen;
  Begleiteinträge tragen `companion:<haupt-id>`).
- **`is_night_med` triggert das Tagesbild** — `consumptionDay(takenAt)`
  rechnet 00:00–03:29 in den Vortag. Das passiert hier, nicht im Frontend.
- **Tagesbild-Trigger: alle Nacht-Medis des aktuellen Plans** — Das
  Tagesbild wird NICHT mehr ausgelöst, wenn eine Substanz mit
  `is_night_med=1` erfasst wird. Stattdessen prüft `POST /api/intakes`
  nach jeder Erfassung, ob ALLE Nacht-Medis (`night`-Slot) des aktuell
  gültigen Plans für den Konsumtag bereits eingenommen sind
  (`allNightMedsTaken(day)` in `db.ts`). Erst wenn alle vorhanden sind,
  wird `nightMed=true` und `assessmentDate` in der Response gesetzt.
  Gilt für JEDE Substanz-Erfassung, sobald der Plan-Complete-State
  erreicht ist — auch Nicht-Nacht-Med-Substanzen lösen dann das
  Tagesbild aus.
- **Import `entries.jsonl` deckt nur Lücken** — Markdown hat Vorrang; ein
  jsonl-Eintrag wird übersprungen, wenn (Tag, Zeit) bzw. (Tag, Substanz)
  bereits aus Markdown vorliegt.
- **Soft-Archive:** `DELETE /api/substances/:id` ohne `?hard=true` setzt
  nur `archived_at`. `findOrCreateSubstance` reaktiviert keine archivierten
  Substanzen — bewusst, damit entfernte Kacheln entfernt bleiben.
- **`effective_from` vs. `created_at`:** Für „welcher Plan galt wann" zählt
  ausschließlich `effective_from`. Eine rückwirkende Version überdeckt
  ältere Versionen nur bis zum nächsthöheren Wirkungsdatum — Beispiel:
  v2 gilt ab 06-06, eine neue v3 „ab 06-01" gilt dann nur 06-01 bis 06-05.
  Für „gilt seit X Tagen bis heute" muss das Wirkungsdatum nach dem der
  bisherigen aktuellen Version liegen (der Normalfall). Bei gleichem
  Wirkungsdatum gewinnt die höhere `id`.


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
| `WEB_DIST` | — | Optional: gebautes Web-Frontend für statische Auslieferung |
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

## Offene Punkte / Next Steps

- [ ] iOS-Build (erfordert macOS + Xcode): `npx cap add ios`
- [ ] Release-APK statt Debug: `assembleRelease` + Signatur
- [ ] Unit-Tests für `lib/defaults.ts` (Parser) und `lib/substances.ts`
      (`nameKey`, `findOrCreateSubstance`, `backfill…`).
- [ ] `Hash`-basierte Erkennung echter Konflikte: aktuell unterscheidet
      der Compliance-Check nicht „absichtlich ohne Default" von
      „noch nicht gepflegt".
- [ ] `IntakeEditSheet` zeigt beim Editieren keinen DEFAULTS-Preview an.
- [ ] Die `nameKey`-Migration für bestehende Dubletten (z. B. „CBD-Öl" +
      „cbd-öl" aus alten Importen) ist nicht automatisch.
- [ ] Geplante (zukünftige) Plan-Versionen lassen sich nicht löschen oder
      nachträglich bearbeiten.
- [ ] Der Plan-Editor bearbeitet immer den **heute aktiven** Stand als
      Ausgangsbasis.

## Bekannte Stolperfallen

- **SQLite `lower()` ist ASCII-only** — `lower('Ö')` bleibt `Ö`. Für
  korrektes Umlaut-Matching ist `nameKey()` in JS Pflicht.
- **DEFAULTS.md wird live eingelesen** — keine Notwendigkeit, den Server
  nach einer Änderung neu zu starten.
- **`Mit:`-Begleitsubstanzen gelten für `POST /api/intakes` UND
  `POST /api/intakes/text`** — Importer, XLSX-Replace und PATCH legen bewusst
  keine an; `companions: false` schaltet sie pro Aufruf ab.
- **`plan-batch` erfasst genau die Plan-Substanzen des Slots** — keine
  `Mit:`-Begleitsubstanzen (sonst Doppelungen).
- **`/api/intakes/text` ist Cloudflare-Access-geschützt (fail-closed)** —
  ohne `CF_ACCESS_TEAM_DOMAIN`+`CF_ACCESS_AUD` → 503; Dev-Bypass
  `CF_ACCESS_DISABLED=true`. `Mit:`-Begleitsubstanzen werden miterfasst
  (`companions: false` schaltet ab), keine Idempotenz.
- **Tagesbild-Trigger: alle Nacht-Medis des aktuellen Plans** — Das
  Tagesbild wird ausgelöst, wenn ALLE Nacht-Medis des wirksamen Plans
  für den Konsumtag eingenommen sind (`allNightMedsTaken`).
- **Soft-Archive:** `DELETE /api/substances/:id` ohne `?hard=true` setzt
  nur `archived_at`. `findOrCreateSubstance` reaktiviert keine archivierten
  Substanzen.
- **`effective_from` vs. `created_at`:** Maßgeblich für „welcher Plan galt
  wann" ist ausschließlich `effective_from`.
- **`build.sh`: Vite sucht `index.html` im CWD** — `cd web/` vor dem
  `vite build`-Aufruf ist zwingend; ohne das scheitert der Build mit
  „Could not resolve entry module 'index.html'".
- **`WEB_DIST`: relative Pfade aus `.env` werden gegen `process.cwd()`
  aufgelöst** (nicht gegen `SERVER_ROOT` wie ältere Stände). Grund: Im
  Build ist `__dirname = <install>/dist/`, also `SERVER_ROOT = <install>/`,
  und `../web/dist` würde **ein** Verzeichnis zu hoch landen
  (`/home/ubuntu/web/dist` statt `/home/ubuntu/mediary/web/dist`).
  **Empfohlener Wert in `.env`:** `WEB_DIST=./web/dist` (relativ zu
  `WorkingDirectory=%h/mediary`) oder absolut `WEB_DIST=/pfad/zu/web/dist`.
  `../web/dist` funktioniert **nicht**.
- **`Cannot GET /` ohne WEB_DIST:** Wenn die systemd-Unit keinen
  `Environment="WEB_DIST=..."` enthält, antwortet der Server auf `GET /`
  mit Express' Default-404 („Cannot GET /"). API-Endpunkte unter `/api/…`
  funktionieren weiterhin. Symptom dafür, dass die Service-Unit nicht
  durch `deploy.sh` regeneriert wurde. Lösung: `Environment="WEB_DIST=./web/dist"`
  in `~/.config/systemd/user/mediary.service` ergänzen, `systemctl --user
  daemon-reload && systemctl --user restart mediary`.

## Letzte Änderungen (chronologisch, für nahtloses Weiterarbeiten)

- **2026-06-14 — „Cannot GET /"-Fix** (Task `2c318cb9`):
  - **Bug:** Nach Commit `18833b2` (`.env`-basierte `WEB_DIST`-Konfiguration)
    wurde `npm run deploy` nicht erneut ausgeführt → die installierte
    `~/.config/systemd/user/mediary.service` enthielt keinen `WEB_DIST`.
    Dazu kam ein **zweiter Bug in `deploy.sh`**: `${VAR}\n` in doppelten
    Bash-Anführungszeichen ist literaler Text, kein Newline — die injizierten
    Env-Lines landeten alle in **einer** Zeile und wurden vom
    systemd-Parser ignoriert. **Dritter Bug:** `resolveFromRoot()` im
    gebauten `dist/config.js` löste `WEB_DIST=../web/dist` zu
    `/home/ubuntu/web/dist` auf (statt `/home/ubuntu/mediary/web/dist`),
    weil `SERVER_ROOT` im Build = `~/mediary` ist und `..` darüber hinaus
    ging.
  - **Fix 1:** `deploy.sh` baut `SERVICE_ENV_LINES` jetzt als Bash-Array
    und schreibt die Env-Lines über `awk` (statt `sed`) in die Service-Unit
    ein. Damit landet jede Env-Variable in einer eigenen Zeile.
  - **Fix 2:** `server/src/config.ts → resolveFromRoot()` löst **alle**
    relativen Pfade aus der `.env` gegen `process.cwd()` auf (nicht mehr
    gegen `SERVER_ROOT`). Empfohlener `WEB_DIST`-Wert: `./web/dist`
    (relativ zu `WorkingDirectory=%h/mediary`).
  - **Hot-Fix auf dem laufenden Service:** `~/mediary/dist/config.js`
    wurde direkt gepatcht, `~/.config/systemd/user/mediary.service` um
    `Environment="WEB_DIST=./web/dist"` ergänzt, Service neu gestartet.
    Verifiziert: `GET /` → 200 (`index.html`), `GET /assets/...js` → 200,
    SPA-Fallback → 200, `/api/health` → 200, `/api/substances` → 200.
  - **Folge-Aktion für User:** `npm run deploy` ausführen, sobald der
    Source-Stand konsistent sein soll — der neue `deploy.sh` läuft jetzt
    sauber durch und schreibt die Service-Unit korrekt.


