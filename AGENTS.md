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
