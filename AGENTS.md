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
├── README.md
└── AGENTS.md    (du bist hier)
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

## Schnellstart

```bash
npm run install:all    # server/ und web/ installieren
npm --prefix server run seed     # 6 Substanzen + 2 Plan-Versionen + Einnahmen
npm run dev            # API :4000, Web :5173 (Proxy /api → 4000)
```

Docker: `docker compose up -d --build` (siehe `docker-compose.yml`).

## Wichtige Architektur-Punkte

- **DEFAULTS.md wird bei JEDEM Schreibvorgang frisch gelesen** (kein Cache).
  Parser: `server/src/lib/defaults.ts → parse()`. Unterstützt `Menge:`/
  `Dosis:` und `Notiz:`/`Hinweis:`; Fließtext unter einer `## …`-Überschrift
  zählt als Notiz. Case-insensitive Match via `nameKey()` (Unicode-aware,
  `toLocaleLowerCase('de')`).
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
  Einnahmen 00:00–03:29 zählen zum Vortag; relevant für die Tagesbild-Zuordnung
  bei Nachtmedikation.
- **Plan-Versionierung** ist ein vollständiger Snapshot pro Version. Der
  `plan_items`-Datensatz hat `version_id` und `substance_id` (NULL = freier Name).

## API-Referenz (Auszug)

| Methode | Pfad | Zweck |
|---|---|---|
| `GET` | `/api/health` | Status |
| `GET` | `/api/metrics` | 11 Tages-Skalen |
| `GET/POST` | `/api/substances` | Substanzen lesen / anlegen |
| `PATCH/DELETE` | `/api/substances/:id` | ändern / archivieren (`?hard=true` löscht) |
| `GET/POST` | `/api/intakes` | Einnahmen (DEFAULTS-Logik, Autovivifikation) |
| `PATCH/DELETE` | `/api/intakes/:id` | ändern / löschen |
| `GET` | `/api/plan` | aktueller Plan |
| `GET` | `/api/plan/at?date=…` \| `?days=N` | Plan zum Stichtag |
| `GET` | `/api/plan/diff?days=N` | Plan-Diff |
| `GET` | `/api/plan/versions` | Versions-Verlauf |
| `PUT` | `/api/plan` | neue Plan-Version |
| `GET` | `/api/assessments?from=&to=` | Tagesbilder (Trends) |
| `GET/PUT/DELETE` | `/api/assessments/:date` | Tagesbild lesen / speichern / löschen |
| `GET/PUT` | `/api/defaults` | DEFAULTS.md lesen / schreiben |
| `GET` | `/api/defaults/check` | DEFAULTS-Compliance-Bericht |

`POST /api/intakes` liefert `{ intake, nightMed, assessmentDate, assessmentExists, createdSubstance }` — `createdSubstance: true` heißt, der Name war neu und wurde als QuickPick angelegt.

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
| `substances` | antippbare Liste (Farbe, Standarddosis, `is_night_med`, Soft-Archive via `archived_at`) |
| `intakes` | Einnahmen (Zeitpunkt, Substanz-Snapshot mit `substance_id` + `substance_name`, Menge, Notizen) |
| `plan_versions` | Plan-Snapshots |
| `plan_items` | Plan-Zeilen (Morgens/Mittags/Abends/Nachts) je Version |
| `daily_assessments` | Tagesbild (11 Skalen als JSON, Primärschlüssel `date`) |

Indices: `idx_intakes_taken_at`, `idx_intakes_source` (Import-Idempotenz),
`idx_plan_items_version`, `idx_plan_versions_source`.

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
│   ├── time.ts                 # DAY_BOUNDARY, nowLocalISO, parseLocal
│   ├── format.ts               # greeting, formatTime, formatDayLabel, …
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

# 2. E2E-Smoke (manuell oder via shell)
cd ../server && rm -rf data
PORT=4011 DEFAULTS_PATH=../DEFAULTS.md node_modules/.bin/tsx src/seed.ts
PORT=4011 DEFAULTS_PATH=../DEFAULTS.md node_modules/.bin/tsx src/index.ts &

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

# 3. Frontend-Bau
cd ../web && node_modules/.bin/vite build   # dist/ entsteht
```

## Letzte Änderungen (jüngste zuerst)

- **Automatische Substanz-QuickPicks + DEFAULTS-Compliance** (aktueller Task):
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

## Bekannte Stolperfallen

- **SQLite `lower()` ist ASCII-only** — `lower('Ö')` bleibt `Ö`. Für
  korrektes Umlaut-Matching ist `nameKey()` in JS Pflicht; keine
  `lower(name) = lower(?)` Queries mehr schreiben.
- **DEFAULTS.md wird live eingelesen** — keine Notwendigkeit, den Server
  nach einer Änderung neu zu starten, aber auch keine Reload-Logik im
  Client nötig (Server liest pro Anfrage frisch).
- **`is_night_med` triggert das Tagesbild** — `consumptionDay(takenAt)`
  rechnet 00:00–03:29 in den Vortag. Das passiert hier, nicht im Frontend.
- **Import `entries.jsonl` deckt nur Lücken** — Markdown hat Vorrang; ein
  jsonl-Eintrag wird übersprungen, wenn (Tag, Zeit) bzw. (Tag, Substanz)
  bereits aus Markdown vorliegt.
- **Soft-Archive:** `DELETE /api/substances/:id` ohne `?hard=true` setzt
  nur `archived_at`. `findOrCreateSubstance` reaktiviert keine archivierten
  Substanzen — bewusst, damit entfernte Kacheln entfernt bleiben.
