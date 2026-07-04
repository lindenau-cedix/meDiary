# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **`CLAUDE.md` ist ein Symlink auf `AGENTS.md`** — der Inhalt gilt für beide.

# meDiary — Medikations-Tagebuch

## TL;DR für eilige KI-Instanzen

```bash
npm run install:all          # Deps (einmalig)
npm run dev                  # API :4000 + Web :5173
npm run typecheck:all        # Server- + Web-TS-Check (exit 0 = sauber)
docker compose up -d --build # Produktionscontainer bauen + starten
```

**Wichtigste Stolperfallen:**
- **Niemals `./data/` für Tests** — das ist das Docker-Volume mit der Live-DB.
  Smoke-Tests immer mit `DB_PATH=/tmp/mediary-test/…` gegen `/tmp` fahren.
- **`nameKey()` statt SQLite `lower()`** — `lower('Ö')` ist ASCII-only und bleibt `Ö`.
  Umlaut-Matching nur über JS `nameKey()` (`toLocaleLowerCase('de')`).

---

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
| Produktion (Docker) | `docker compose up -d --build` |
| Seed / Import (tsx-Skripte) | `npm --prefix server run seed` · `… run import` |
| Einzelnes Skript/Modul fahren | `cd server && DB_PATH=/tmp/x/db CF_ACCESS_DISABLED=true npx tsx src/<file>.ts` |

**Smoke-Test-Rezept** (eigener Server gegen `/tmp`, dann ein Endpunkt):

```bash
cd server && rm -rf /tmp/m && mkdir -p /tmp/m
DB_PATH=/tmp/m/db.sqlite DEFAULTS_PATH=/tmp/m/DEFAULTS.md CF_ACCESS_DISABLED=true \
  PORT=4099 DREAM_SCHEDULER_DISABLED=true npx tsx src/index.ts &
curl -s localhost:4099/api/health        # weitere Rezepte: docs/development.md
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
  03:30-Berlin-Cron) fließt in den Traum-Kontext ein — zusätzliche Sektion
  „Tagesbericht des Hermes-Agents" plus die jüngsten 7 Berichte, damit das
  nächtliche „Träumen" nicht nur 1–10-Skalen + Notizen kennt, sondern auch
  welche Agent-/Coding-/Server-Aktivität am Tag stattfand (Default-`date` =
  `dreamTargetDate(now)`, also Konsum-Vortag — passt zum 04:20-Traum). Ein
  vorhandener Bericht zählt für `hasContent` (kein Traum-Skip mehr nur wegen
  leerer Medikations-Sektion).
- **Drei KI-Integrationen, drei Wire-Formate** (alle Keys ausschließlich serverseitig):
  KI-Tagebuch = Anthropic-Messages (`lib/anthropic.ts`), nächtliches „Träumen" =
  OpenAI-Chat-Completions (`lib/minimax.ts`), Daten-Konsole = Anthropic-Messages mit
  Tool-Loop + SSE (`lib/chat_agent.ts`). Alle laufen wahlweise gegen MiniMax.
- **Auth = Cloudflare Access** (`lib/cloudflare_access.ts`, fail-closed), bewusst NUR
  auf mutierenden Endpunkten (`POST /api/intakes/text`, `/api/chat/*`-Writes); der Rest
  der API ist offen (privates Deployment). `CF_ACCESS_DISABLED=true` = Local-Bypass.
- **Datenfluss Web:** `lib/api.ts` (typisierte Fetch-Wrapper) → `lib/queries.ts`
  (react-query Hooks + Query-Keys) → Screens. Server: `routes/*` →
  `lib/serialize.ts` (snake_case-Row → camelCase-DTO); Schema idempotent in `db.ts`.

## Letzte Session-Änderungen

- **Tagesbericht des Hermes-Agents → Traum-Kontext + Info-Subtab (2026-07-04):**
  Neuer Endpoint `POST /api/report/new` (Body `{ date?, report, source? }`,
  idempotenter Upsert pro Konsum-Tag, Default-`date` = `dreamTargetDate(now)`).
  Tabelle `daily_reports` (PK `date`). `gatherDreamContext` (`lib/dreams.ts`)
  zieht den Tagesbericht des Ziel-Tags **und** die jüngsten 7 Berichte als
  eigene Sektionen in den Traum-Prompt — das nächtliche „Träumen" kennt jetzt
  auch, was der Hermes-Agent am Tag gemacht hat (Coding, Cron, Deploys,
  Fehler). `hasContent` berücksichtigt einen vorhandenen Bericht, damit der
  Traum-Skip nicht mehr rein auf Grund leerer Medikations-Sektionen greift.
  Im **Tagebuch-Info-Subtab** (`web/src/screens/DiaryScreen.tsx`) erscheint
  der Bericht als eigene Sektion „Hermes-Agent" (Lucide-Icon `Bot`, mit
  optionaler Quellenangabe); lange Berichte klappen hinter
  „Weiterlesen" (> 600 Zeichen, gleiche Schwelle wie Traum-Karten) zusammen.
  Tage mit NUR einem Bericht zählen als „noteworthy" und erscheinen auch
  ohne Einnahmen / Tagesbild / Wachzeit. `buildDayPrompt` (`lib/diary.ts`)
  reicht den Bericht zusätzlich an die KI-Tagebuch-Generierung weiter.
  Dateien: `server/src/routes/report.ts`, `server/src/db.ts`,
  `server/src/lib/dreams.ts`, `server/src/lib/diary.ts`,
  `server/src/lib/serialize.ts`, `server/src/index.ts`,
  `server/src/routes/diary.ts`, `web/src/lib/types.ts`,
  `web/src/screens/DiaryScreen.tsx`, `docs/api.md`, `docs/architecture.md`,
  `docs/changelog.md`. Cron-Beispiel für den 03:30-Berlin-Trigger:
  ```bash
  curl -fsS -X POST "${MEDIARY_URL}/api/report/new" \
    -H 'Content-Type: application/json' \
    -d "{\"report\":\"$(cat /var/log/hermes/daily-report.md)\",\"source\":\"hermes-cron-0330\"}"
  ```
- **Daten-Konsole „Chat with your data" (2026-06-18):** Neuer Tab `/konsole` für
  natürlichsprachige Massen-Korrekturen. Lesen läuft read-only (separate
  `{readonly:true}`-SQLite-Verbindung, nur `SELECT`/`WITH`); Schreiben NUR über
  typisierte, zod-validierte Change-Sets, die in der UI mit before→after-Vorschau
  bestätigt werden — transaktional + Undo (Vorzustands-Snapshot), Audit-Log in
  `chat_change_sets`. Modell = **MiniMax M3** über den **Anthropic-kompatiblen**
  Endpunkt (`CHAT_BASE_URL/v1/messages`, Tool-Loop, `thinking`-Blöcke bewahrt,
  SSE). Schlüssel serverseitig (Default `MINIMAX_API_KEY`, `CHAT_API_KEY` Vorrang).
  Mutierende Endpunkte CF-Access-geschützt + rate-limitiert. Dateien:
  `server/src/lib/chat_tools.ts` (Sicherheitsschicht), `…/chat_agent.ts`
  (Agent-Loop), `routes/chat.ts`, `web/src/screens/ConsoleScreen.tsx` +
  `web/src/components/console/*`. Details: [docs/changelog.md](docs/changelog.md),
  [docs/api.md](docs/api.md).
- **npm-Audit bereinigt (2026-06-17):**
  - `server/package-lock.json`: transitive `tsx → esbuild`-Version von
    `0.28.0` auf `0.28.1` aktualisiert.
  - `web/package.json` + `web/package-lock.json`: npm-`overrides` für
    `tar@7.5.16` ergänzt, damit die `@capacitor/cli@6.2.1`-Schwachstellen
    ohne Capacitor-Major-Upgrade behoben sind.
- **Verifiziert:** `npm audit` in `server/` und `web/`, `npm run typecheck:all`,
  `npm run build` und `npm run install:all` laufen sauber mit `0 vulnerabilities`.
- **Hinweis:** Die verbleibenden npm-`allow-scripts`-Warnungen betreffen
  Install-Skripte (`better-sqlite3`, `esbuild`) und sind keine Audit-Befunde.

## Detail-Dokumentation

Die ausführliche Doku ist nach Themen in `docs/` aufgeteilt — gezielt das passende
File lesen, statt alles auf einmal in den Kontext zu laden:

- **[docs/development.md](docs/development.md)** — Schnellstart, alle Kommandos,
  Verifikations-Rezepte (Smoke-Tests gegen `/tmp`, einzelne Endpunkte prüfen).
- **[docs/architecture.md](docs/architecture.md)** — Architektur-Punkte
  (Tagesgrenze 03:30, DEFAULTS live, `Mit:`-Begleitsubstanzen, Plan-Versionierung
  mit `effective_from`, Habit/Wachzeit, nächtliches „Träumen"), DEFAULTS-Compliance,
  DB-Schema, Frontend-Struktur.
- **[docs/api.md](docs/api.md)** — API-Referenz (alle Endpunkte inkl.
  `/api/intakes/text` und `/api/dreams`).
- **[docs/deployment.md](docs/deployment.md)** — Docker-Compose-Deployment, Env-Variablen,
  iPad/Capacitor-APK.
- **[docs/pitfalls.md](docs/pitfalls.md)** — Bekannte Stolperfallen.
  **Vor Änderungen lesen.**
- **[docs/roadmap.md](docs/roadmap.md)** — Offene Punkte / Next Steps.
- **[docs/changelog.md](docs/changelog.md)** — „Letzte Änderungen": chronologische
  Detailhistorie aller Sessions (nachschlagen, was wann & warum geändert wurde).
