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
`DB_PATH` (Default `server/data/mediary.db`, relativ zu `server/`),
`DEFAULTS_PATH` (Default `../DEFAULTS.md`), `WEB_DIST` (optional: gebautes
Frontend statisch mit ausliefern).

Docker: `docker compose up -d --build` (siehe `docker-compose.yml`) — die DB
liegt dann im Volume `./data` im **Projekt-Root** (Live-Daten!).

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
  Tagesbild ausgelöst. Gilt NICHT für Importer/XLSX-Import/PATCH;
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
  Einnahmen 00:00–03:29 zählen zum Vortag; relevant für die Tagesbild-Zuordnung
  bei Nachtmedikation.
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

# 3. Frontend-Bau
cd ../web && node_modules/.bin/vite build   # dist/ entsteht
```

## Letzte Änderungen (jüngste zuerst)

- **Kachel-Reihenfolge im „Heute"-Tab sortierbar** (aktueller Task):
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
- **Begleitsubstanzen via DEFAULTS `Mit:`** (aktueller Task):
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
- **`Mit:`-Begleitsubstanzen gelten nur für `POST /api/intakes`** — Importer,
  XLSX-Replace und PATCH legen bewusst keine Begleit-Einnahmen an (Historie
  bleibt Historie). Es wird genau eine Ebene aufgelöst: `Mit:`-Zeilen der
  Begleitsubstanz werden ignoriert, `Mit: <Substanz selbst>` ebenso. Eine
  per `Mit:` referenzierte Substanz ohne eigenen `## …`-Abschnitt taucht
  nach dem ersten Auto-Eintrag im Compliance-Check als `missing` auf —
  gewollt (Aufforderung, sie zu pflegen).
- **`is_night_med` triggert das Tagesbild** — `consumptionDay(takenAt)`
  rechnet 00:00–03:29 in den Vortag. Das passiert hier, nicht im Frontend.
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
