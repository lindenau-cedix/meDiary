# meDiary

Ein sorgfältig gestaltetes **Medikations-Tagebuch** mit HTTP-API, SQLite-Datenbank
und einem touch-first Frontend für **PC, iPad und Android (als APK)**.

meDiary erfasst Einnahmezeitpunkte mit einem Tipp, führt einen **versionierten
Medikationsplan** (inkl. „was war vor X Tagen anders?"), übernimmt automatisch
hinterlegte Standard-Notizen aus einer `DEFAULTS.md` und fragt nach Einnahme der
**Nachtmedikation** ein **Tagesbild** aus 11 klinischen Skalen (1–10) ab.

```
meDiary/
├── server/   → HTTP-API (Express + TypeScript + SQLite)
└── web/      → Frontend (React + Vite + Tailwind, Capacitor-fähig)
```

---

## Funktionsumfang

| Anforderung | Umsetzung |
|---|---|
| HTTP-API schreibt/liest aus Datenbank | Express-API + SQLite (`better-sqlite3`) |
| Medikationsplan **mit Verlauf** | Versionierte Snapshots, Stichtags-Abfrage & Diff |
| Einnahmen (Zeitpunkt, Substanz, Menge, Notizen) | `intakes`-Endpunkte, Verlaufsansicht |
| `DEFAULTS.md` für Standard-Notizen | Parser mit mtime-Cache, automatische Übernahme |
| Eigene Substanz-Liste zum Antippen | Substanz-Verwaltung (Farbe, Dosis, Nachtmed) |
| Datum/Uhrzeit auf **jetzt** vorbelegt | Composer mit „Jetzt"-Reset |
| Plan im Frontend einstellbar | Voll editierbarer Plan-Editor (neue Version) |
| Einnahmen darstellen | Verlauf, nach Tagen gruppiert, filterbar |
| Nachtmed → 11 Skalen 1–10 abfragen | Automatisch ausgelöstes Tagesbild-Sheet |
| Sehr gutes, nicht „billiges" Design | Eigenes „Apotheken"-Designsystem, Light/Dark |
| PC / iPad / Android, leicht & schnell | Responsives Touch-UI, Safe-Areas, Haptik, APK |

Die 11 Tages-Skalen (Reihenfolge gemäß `import/konsum_tagebuch_skalen.md`):
**Schlafqualität, Müdigkeit/Erschöpfung, Stabilität, Psychotisch/Realitätsferne,
Stimmung, Leistung/Funktion im Alltag, Angst/innere Anspannung, Craving/Suchtdruck,
Überstimulation/Getriebenheit, Sedierung/Benommenheit, Schmerz/körperliche Beschwerden.**

---

## Schnellstart

**Voraussetzungen:** Node.js ≥ 18 (getestet mit 22).

```bash
# 1) Abhängigkeiten installieren (Server + Web)
npm run install:all
# (optional) Bequemlichkeit im Wurzelordner:
npm install

# 2) Beispiel-Daten anlegen (Substanzen, 2 Planversionen, Einnahmen, Tagesbilder)
npm run seed

# 3) API + Frontend gemeinsam starten
npm run dev
```

- API: <http://localhost:4000>  ·  Frontend (Dev): <http://localhost:5173>
- Der Dev-Server proxyt `/api` automatisch auf die API.

Server und Web lassen sich auch einzeln starten:

```bash
npm run dev:server     # nur API
npm run dev:web        # nur Frontend
```

> Läuft die API auf einem anderen Port, beim Web-Dev-Start setzen:
> `VITE_API_PROXY=http://localhost:4123 npm run dev:web`

### Konfiguration (Server)

`server/.env` (siehe `server/.env.example`):

```
PORT=4000
DB_PATH=./data/mediary.db
DEFAULTS_PATH=../DEFAULTS.md   # DEFAULTS.md im Projekt-Wurzelverzeichnis
WEB_DIST=          # optional: Pfad zu web/dist, um das Frontend mit auszuliefern
```

---

## Produktion (ein Server liefert alles aus)

```bash
npm run build:web                      # Frontend nach web/dist bauen
WEB_DIST=../web/dist npm run start      # API + Frontend auf einem Port
```

Danach ist die komplette App unter <http://localhost:4000> erreichbar.

### Docker (empfohlen)

Ein Container = API **und** Frontend auf Port 4000. Die SQLite-DB liegt im
Volume `./data`, die `DEFAULTS.md` wird vom Host eingebunden (live editierbar).

```bash
docker compose up -d --build           # bauen + starten
docker compose exec mediary node dist/seed.js   # optional: Demodaten
docker compose logs -f                 # Logs
```

App: <http://localhost:4000> · API: `…/api/health`. **Backup** = `./data` sichern,
z. B. `sqlite3 ./data/mediary.db ".backup ./data/backup-$(date +%F).db"`.

**Von überall (HTTPS):** [Caddy](https://caddyserver.com) davor stellen — eine
`Caddyfile` mit `deine-domain.de { reverse_proxy mediary:4000 }`, beide Dienste
im selben `docker-compose.yml`, und `mediary` aus den `ports` nehmen (nur intern).

### Android-APK an den Server koppeln

Egal ob Docker, systemd oder LAN: in der App **Einstellungen → Server** die
Adresse eintragen — `http://<LAN-IP>:4000` im Heimnetz (Klartext ist erlaubt)
bzw. `https://deine-domain.de` von außen.

---

## Daten importieren (`import/`-Ordner)

Der Importer nutzt die **kuratierten Markdown-Logs als Hauptquelle** (sie sind sauberer
als `entries.jsonl`: exakte Uhrzeiten, klare Substanznamen, Korrekturen bereits
eingearbeitet) und füllt mit `entries.jsonl` nur die Lücken:

| Quelle | liefert |
|---|---|
| `medikations_akutverlauf.md` | Akut-/Bedarfseinnahmen (primär, getimt) |
| `medikationsplan_verlauf.md` | versionierter Plan (Voll-Snapshots + Deltas, chronologisch) |
| `konsum_tagebuch_skalen.md` | Tagesbilder (11 Skalen; 10- oder 11-Werte-Zeilen) |
| `entries.jsonl` | **Lückenfüller**: planmäßige Einnahmen + alles, was die Markdown-Logs nicht abdecken (z. B. der 09.06.); Korrekturen |

Bei Überschneidung **gewinnt Markdown**: ein jsonl-Eintrag wird übersprungen, wenn
dieselbe (Tag, Uhrzeit) bzw. – bei fehlender Uhrzeit – dasselbe (Tag, Substanz) bereits
aus Markdown vorliegt. Tagessummen/Kontextzeilen und fehlgeloggte Klartext-Korrekturen
werden gefiltert. **Idempotent** über `source_event_id`; **Dry-Run ist Standard** —
es wird erst mit `--commit` geschrieben.

**Lokal / systemd:**
```bash
npm --prefix server run import                 # Dry-Run: zeigt nur, was käme
npm --prefix server run import -- --commit     # tatsächlich schreiben
# sauberer Neu-Import: --commit --reset-imported
```

**Docker (Live-System):** den Ordner in einen Einmal-Container mounten — schreibt in
dieselbe DB (`/data`-Volume). Vorher Image bauen (`docker compose build`).
```bash
# Dry-Run:
docker compose run --rm -v "$PWD/import:/import:ro" -e IMPORT_DIR=/import \
  mediary node dist/import.js
# Schreiben (Server kurz stoppen vermeidet DB-Lock):
docker compose stop mediary
docker compose run --rm -v "$PWD/import:/import:ro" -e IMPORT_DIR=/import \
  mediary node dist/import.js --commit
docker compose start mediary
```

> Hinweis: Substanznamen werden bestmöglich gekürzt, der **vollständige Originaltext
> steht jeweils in der Notiz**. Die 11 App-Skalen entsprechen jetzt exakt der
> `konsum_tagebuch_skalen.md`. Der 09.06. liegt in `entries.jsonl` unsauber vor
> (finale Timeline + ältere Korrektur-Nachrichten als Einnahmen) — kurz im Verlauf
> gegenlesen.

---

## `DEFAULTS.md`

Standard-**Notizen und -Mengen** pro Substanz. Werden beim Anlegen einer Einnahme
automatisch übernommen, wenn Menge bzw. Notiz nicht selbst angegeben wurden — die
konkrete Eingabe hat immer Vorrang. Die API liest die Datei **bei jedem
Schreibvorgang frisch** (kein Cache).

```markdown
## CBD-Joints
Menge: 0,4–0,5 g
Notiz: „dünner, aber voller Joint", wenn keine Menge genannt wird.

## Energy-Drinks
Notiz: 32 mg Koffein pro 100 ml, solange keine produktspezifischen Werte genannt werden.

## Theanin
Menge: 400 mg
Mit: Lemon Balm | 100 mg | als 5:1-Extrakt
```

`Menge:` (alias `Dosis:`) → Standard-Menge, `Notiz:` (alias `Hinweis:`) →
Standard-Notiz; reiner Fließtext unter der Überschrift zählt ebenfalls als Notiz.
Die Datei liegt im **Projekt-Wurzelverzeichnis** (`DEFAULTS.md`) und ist auch in den
**Einstellungen** des Frontends bearbeitbar.

### Begleitsubstanzen (`Mit:`)

`Mit: <Name> | <Menge> | <Notiz>` (alias `Zusammen mit:`) erfasst beim Eintragen
der Substanz **automatisch eine zweite Einnahme** für die genannte
Begleitsubstanz — gleicher Zeitpunkt, Menge/Notiz optional (ohne Angabe gelten
die Defaults der Begleitsubstanz: Standarddosis bzw. eigener DEFAULTS-Eintrag).
Mehrere `Mit:`-Zeilen sind möglich. `Mit:`-Angaben der Begleitsubstanz werden
**nicht weiterverfolgt** (eine Ebene, keine Zyklen); Selbstbezüge werden
übersprungen. Die Begleitsubstanz wird bei Bedarf als QuickPick angelegt, ihr
Eintrag bekommt `source_event_id = companion:<id-des-auslösenden-Eintrags>`.
Ist die Begleitsubstanz eine Nachtmedikation, wird das Tagesbild genauso
ausgelöst. Gilt nur für `POST /api/intakes` (nicht für Importer/XLSX/PATCH);
`{"companions": false}` im Request schaltet es ab. Die Antwort enthält die
angelegten Einträge unter `companions[]`, der Composer zeigt eine Vorschau
(„Automatisch dazu: …") und „Rückgängig" im Toast entfernt Haupt- und
Begleit-Einträge gemeinsam.

> Programmatische Regeln aus früheren Notizen sind in den Code gewandert: die
> **Tagesgrenze des Konsum-Tags (03:30 Europe/Berlin)** liegt in
> `server/src/lib/time.ts` (`DAY_BOUNDARY`) und bestimmt, welchem Tag das Tagesbild
> einer Nachtmedikation zugeordnet wird (Einnahmen 00:00–03:29 → Vortag).

### Automatische Substanz-QuickPicks

Jede Substanz, die jemals per `POST /api/intakes` mit `substanceName` erfasst
wurde (z. B. aus dem WhatsApp-Importer oder einer externen App), wird
**automatisch als Kachel** in der Substanz-Liste angelegt. Dafür sorgt
`server/src/lib/substances.ts → findOrCreateSubstance()`. Beim **Serverstart**
läuft zusätzlich `backfillSubstancesFromIntakes()`, das bestehende Einnahmen
ohne `substance_id` rückwirkend verknüpft; der Importer macht das nach
`--commit` ebenfalls in einem Schritt. Das Matching ist Unicode-aware
(`toLocaleLowerCase('de')`), damit `CBD-Öl` und `cbd-öl` zusammenfinden.

### DEFAULTS-Compliance-Check

`GET /api/defaults/check` vergleicht **jede Substanz** (aus `substances` und
aus `intakes`) gegen die Einträge in `DEFAULTS.md` und liefert eine Aufteilung
in `compliant` (hat Eintrag) und `missing` (kein Eintrag). Das Frontend
nutzt das auf zwei Arten:

- Auf dem **Heute-Bildschirm** zeigt eine Warnkarte oben an, wie viele
  Substanzen ohne DEFAULTS-Eintrag sind; betroffene Kacheln bekommen ein
  kleines Warn-Icon.
- In den **Einstellungen → Prüfung: DEFAULTS.md** gibt es eine Liste aller
  „missing"-Substanzen mit Einnahme-Zähler und einem **„Eintrag"-Button**,
  der im DEFAULTS-Editor sofort einen neuen Abschnitt `## <Name>` mit
  leerer `Notiz:`-Zeile anlegt und den Cursor dorthin springen lässt.

So wird das Pflegen von `DEFAULTS.md` zum Bestandteil des üblichen
Eintragens, statt eine separate Pflicht-Übung zu sein.

---

## API-Referenz (Auszug)

| Methode | Pfad | Zweck |
|---|---|---|
| `GET` | `/api/health` | Status |
| `GET` | `/api/metrics` | Definition der 11 Skalen |
| `GET/POST` | `/api/substances` | Substanzen lesen / anlegen |
| `PATCH/DELETE` | `/api/substances/:id` | ändern / archivieren (`?hard=true` löscht) |
| `GET/POST` | `/api/intakes` | Einnahmen lesen / anlegen (DEFAULTS-Logik) |
| `PATCH/DELETE` | `/api/intakes/:id` | ändern / löschen |
| `GET` | `/api/plan` | aktueller Plan |
| `GET` | `/api/plan/at?date=…` \| `?days=N` | Plan zum Stichtag |
| `GET` | `/api/plan/diff?days=N` | Änderungen ggü. „vor N Tagen" |
| `GET` | `/api/plan/versions` | Versions-Verlauf |
| `PUT` | `/api/plan` | neue Plan-Version speichern |
| `GET` | `/api/assessments?from=&to=` | Tagesbilder (für Trends) |
| `GET/PUT/DELETE` | `/api/assessments/:date` | Tagesbild lesen / speichern / löschen |
| `GET/PUT` | `/api/defaults` | DEFAULTS.md lesen / schreiben |
|| `GET` | `/api/defaults/check` | DEFAULTS-Compliance-Bericht (alle Substanzen mit/ohne Eintrag) |

`POST /api/intakes` liefert zusätzlich `{ nightMed, assessmentDate, assessmentExists }` —
darüber öffnet das Frontend bei Nachtmedikation automatisch das Tagesbild.

---

## Android-APK (Capacitor)

Das Frontend ist Capacitor-fähig. Voraussetzung für den Build: **Android Studio /
Android SDK** und ein JDK (17+).

```bash
cd web
npm run build            # Web-Assets bauen (web/dist)
npx cap add android      # einmalig: Android-Projekt anlegen
npx cap sync android     # Assets + Plugins synchronisieren
npx cap open android     # in Android Studio öffnen → APK bauen/Run

# alternativ direkt per Gradle:
cd android && ./gradlew assembleDebug
# → android/app/build/outputs/apk/debug/app-debug.apk
```

In der App unter **Einstellungen → Server** die Adresse der API eintragen
(z. B. `http://192.168.1.20:4000`). HTTP im Heimnetz ist über die
Capacitor-Konfiguration (`cleartext`) bereits erlaubt.

---

## Design

- **Typografie:** *Fraunces* (Display) + *Hanken Grotesk* (UI) — lokal gebündelt,
  funktioniert offline in der APK.
- **Palette:** warme „Apotheken"-Töne, vollwertiger **Light- und Dark-Mode**
  (native Datums-/Zeit-Picker passen sich via `color-scheme` an).
- **Touch-first:** große Flächen, Safe-Area-Insets, Haptik, „Long-Press =
  Soforteintrag", schwebende Bestätigung, Wisch-zu-schließen-Sheets.
- Werte-Trends als handgezeichnete SVG-Charts (keine generische Chart-Lib).

---

## Datenmodell (SQLite)

- `substances` — antippbare Liste (Farbe, Standarddosis, `is_night_med`)
- `intakes` — Einnahmen (Zeitpunkt, Substanz-Snapshot, Menge, Notizen)
- `plan_versions` / `plan_items` — versionierter Plan (Morgens/Mittags/Abends/Nachts)
- `daily_assessments` — Tagesbild je Datum (11 Skalen als JSON)
