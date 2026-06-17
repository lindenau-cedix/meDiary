# meDiary — Entwicklung & Verifikation

> Teil der meDiary-Projektdoku — Übersicht & Index in [CLAUDE.md](../CLAUDE.md).

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
npm run build                    # Web + Server bauen
npm --prefix server run import               # Importer Dry-Run (liest import/)
npm --prefix server run import -- --commit   # schreibt in die DB (--reset-imported ersetzt Importiertes)
npm run cap:android              # Capacitor: android/ anlegen + syncen (in web/: cap:sync, cap:open)
```

Server-Konfiguration über Env/`.env` (`server/src/config.ts`): `PORT` (4000),
`DB_PATH`, `DEFAULTS_PATH`, `WEB_DIST`. Defaults (wenn keine Env gesetzt):
- `DB_PATH` → `~/.local/share/mediary/data/mediary.db`
- `DEFAULTS_PATH` → `~/.local/share/mediary/DEFAULTS.md`
- `WEB_DIST` → wird nicht gesetzt (API läuft solo)

**`.env`-Datei**: Vorlage in `.env.example`. Docker Compose liest `.env`
optional ein; für lokale Node-Starts lädt der Server zusätzlich `server/.env`
über `dotenv`. `.env` ist in `.gitignore`.

**Docker-Deployment:**
```bash
docker compose up -d --build
docker compose logs -f mediary
```

Die produktive DB liegt im Repo-Root unter `./data/mediary.db`. Dieses
Verzeichnis ist das Live-Datenverzeichnis und darf nicht für Tests benutzt
werden.

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
