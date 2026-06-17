# meDiary — Architektur

> Teil der meDiary-Projektdoku — Übersicht & Index in [CLAUDE.md](../CLAUDE.md).

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
- **Habit / Wachzeit** (`server/src/routes/habit.ts`, Tabelle `daily_habits`):
  Der Client-Cron meldet per `POST /api/habit/uptime` einen Unix-Zeitpunkt für
  die früheste User-Interaktion im 24h-Fenster vor dem Cron
  (`first_user_interaction_24h_unix`) und einen für die letzte
  (`last_user_interaction_unix`). Wir leiten daraus **nicht** PC-Bildschirmzeit,
  sondern die **Wachzeit** des Vortages ab — Aufwachen bis Einschlafen. Ziel-
  Datum ist **immer der Konsum-Vortag** aus Sicht des Webhook-Aufrufs
  (Tagesgrenze 03:30 Europe/Berlin, hart `today - 1`), unabhängig von der
  konkreten `last`-Wand­uhrzeit. Algorithmus:
    1. `intakeFirst` = späteste Einnahme des Ziel-Tages im Intervall
       `[Tagesbeginn 03:30, first)` (Einnahme muss nach 03:30 und VOR
       `first` liegen — sie ist der späteste Hinweis, dass der Mensch
       bereits wach war, bevor die erste PC-Interaktion gemeldet wurde).
    2. `intakeLast` = späteste Einnahme des Ziel-Tages (egal wann).
    3. `wake_first_unix` = `intakeFirst` falls gefunden, sonst
       `first_user_interaction_24h_unix`.
    4. `wake_last_unix`  = `max(intakeLast, last_user_interaction_unix)`.
  Einnahmen werden im Wand­uhr-Bereich
  `targetT03:30:00 … (target+1)T03:29:59` (Konsum-Tag-Bereich) gesucht
  und als Unix-Sekunden via `new Date(iso).getTime()/1000` (lokales
  `new Date(iso)` = lokale Wand­uhr) konvertiert. Plausi-Checks:
  `last <= now + 15 min` (Clock-Skew) und
  `first >= now − 25 h` (echtes 24h-Fenster + Slack). `wake_first`/`wake_last`
  fließen in `gatherDiaryDays()` (Kurzfassung-Block „Wachzeit") und in
  `buildDayPrompt()` ein; **nicht** als Bildschirmzeit, sondern explizit
  als Spanne vom ersten Wach-Moment bis zum letzten Wach-Moment
  (Kommentar im KI-Prompt weist die schreibende KI darauf hin). Schema-
  Migration (`db.ts`, idempotent): alte Spalten `pc_first_interaction_unix`/
  `pc_last_interaction_unix` werden per `ALTER TABLE … RENAME COLUMN`
  (SQLite ≥ 3.25) auf `wake_first_unix`/`wake_last_unix` umbenannt,
  Fallback-Pfad für ältere SQLite-Versionen (Tabelle neu anlegen +
  kopieren) liegt vor.

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
| `daily_habits` | Tägliche **Wachzeit** (`wake_first_unix`, `wake_last_unix`, beide nullable) pro Konsum-Tag — siehe Abschnitt „Habit / Wachzeit" |
| `dreams` | Nächtliche KI-Auswertung („Traum") pro Konsum-Tag (PK `date`, `content`, `model`, `status`, `created_at`, `updated_at`) — siehe Abschnitt „Nächtliches Träumen" / Änderung 2026-06-17 |

Indices: `idx_intakes_taken_at`, `idx_intakes_source` (Import-Idempotenz),
`idx_plan_items_version`, `idx_plan_versions_source`, `idx_plan_versions_effective`.

## Frontend-Struktur

```
web/src/
├── App.tsx                 # Router + Theme + QueryClient
├── main.tsx
├── screens/
│   ├── QuickEntryScreen.tsx    # Heute: Composer (Mehrfach-Auswahl) + Kachel-Raster + Tagesbild
│   ├── HistoryScreen.tsx       # Verlauf nach Tagen gruppiert
│   ├── DiaryScreen.tsx         # Tagebuch: Kurz (Notiz-Liste) / Voll (KI-generiert)
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
