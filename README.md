# meDiary

A carefully crafted **medication diary** with HTTP API, SQLite database, and a
touch-first frontend for **PC, iPad, and Android (as an APK)**.

meDiary records intake events with a single tap, maintains a **versioned
medication plan** (including "what was different X days ago?"), auto-applies
default notes from a `DEFAULTS.md`, and — after the night medication is taken
— prompts you for an **11-scale daily assessment** (1–10).

The UI is available in German and English, auto-detected from the browser with
a switcher in Settings; German remains the fallback.

```
meDiary/
├── server/   → HTTP API (Express + TypeScript + SQLite)
└── web/      → Frontend (React + Vite + Tailwind, Capacitor-ready)
```

---

## Features

| Requirement | Implementation |
|---|---|
| HTTP API reads/writes the database | Express API + SQLite (`better-sqlite3`) |
| Medication plan **with history** | Versioned snapshots, as-of queries, and diff |
| Intakes (timestamp, substance, amount, notes) | `intakes` endpoints, history view |
| `DEFAULTS.md` for default notes | Parser with mtime cache, automatic application |
| Tappable custom substance list | Substance management (color, dose, night med) |
| Date/time pre-filled to **now** | Composer with "Now" reset |
| Plan editable in the frontend | Fully editable plan editor (new version) |
| Intakes view | History grouped by day, filterable |
| Night med → 11 scales 1–10 | Automatically triggered assessment sheet |
| **Hermes agent daily report** | `POST /api/report/new` (03:30 cron upsert per consumption day); appears in the **diary info sub-tab** and in the **dream context** (so M3 knows about coding/cron/deploys of the day) |
| Top-quality, not "cheap" design | Custom "pharmacy" design system, light/dark |
| PC / iPad / Android, light & fast | Responsive touch UI, safe areas, haptics, APK |

The 11 daily scales (order matches `import/konsum_tagebuch_skalen.md`):
**sleep quality, fatigue/exhaustion, stability, psychotic/detached-from-reality,
mood, daily functioning, anxiety/internal tension, craving/addiction pressure,
overstimulation/feeling driven, sedation/drowsiness, pain/physical complaints.**

---

## Quickstart

**Requirements:** Node.js ≥ 18 (tested with 22).

```bash
# 1) Install dependencies (server + web)
npm run install:all
# (optional) Convenience helper in the root folder:
npm install

# 2) Seed example data (substances, 2 plan versions, intakes, daily assessments)
npm run seed

# 3) Start API + frontend together
npm run dev
```

- API: <http://localhost:4000> · Frontend (dev): <http://localhost:5173>
- The dev server proxies `/api` to the API automatically.

Server and web can also be started individually:

```bash
npm run dev:server     # API only
npm run dev:web        # frontend only
```

> If the API runs on a different port, set this when starting the web dev server:
> `VITE_API_PROXY=http://localhost:4123 npm run dev:web`

### Server configuration

`server/.env` (see `server/.env.example`):

```
PORT=4000
DB_PATH=./data/mediary.db
DEFAULTS_PATH=../DEFAULTS.md   # DEFAULTS.md in the project root
WEB_DIST=          # optional: path to web/dist to serve the frontend from
```

---

## Production (Docker Compose)

```bash
docker compose up -d --build
```

One container serves both the API **and** the frontend on port 4000. The
SQLite DB, `DEFAULTS.md`, and the generated diary file live in the repo root
under `./data`. The container runs with `restart: unless-stopped`.

```bash
docker compose exec mediary node dist/seed.js   # optional: demo data
docker compose logs -f                 # logs
```

App: <http://localhost:4000> · API: `…/api/health`. **Backup** = back up `./data`,
e.g. `sqlite3 ./data/mediary.db ".backup ./data/backup-$(date +%F).db"`.

**Expose publicly (HTTPS):** put [Caddy](https://caddyserver.com) in front — a
`Caddyfile` with `your-domain.de { reverse_proxy mediary:4000 }`, both services
in the same `docker-compose.yml`, and remove `mediary` from `ports` (internal only).

### Local production without Docker

```bash
npm run build
WEB_DIST=../web/dist DB_PATH=../data/mediary-local.db DEFAULTS_PATH=../DEFAULTS.md npm run start
```

After that the complete app is reachable at <http://localhost:4000>.

### Pairing the Android APK with the server

Whether Docker or a local LAN server: in the app open **Settings → Server** and
enter the address — `http://<LAN-IP>:4000` on the home network (plaintext is
allowed) or `https://your-domain.de` from outside.

---

## Importing data (`import/` folder)

The importer uses the **curated Markdown logs as its primary source** (they're
cleaner than `entries.jsonl`: exact timestamps, clear substance names, corrections
already incorporated) and only fills gaps with `entries.jsonl`:

| Source | Provides |
|---|---|
| `medikations_akutverlauf.md` | Acute / as-needed intakes (primary, timed) |
| `medikationsplan_verlauf.md` | Versioned plan (full snapshots + deltas, chronological) |
| `konsum_tagebuch_skalen.md` | Daily assessments (11 scales; 10- or 11-value lines) |
| `entries.jsonl` | **Gap filler**: scheduled intakes + everything the Markdown logs don't cover (e.g. 09.06); corrections |

On overlap **Markdown wins**: a jsonl entry is skipped if the same
(day, time) — or, when no time, the same (day, substance) — already comes from
Markdown. Daily totals/context lines and mislogged plaintext corrections are
filtered out. **Idempotent** via `source_event_id`; **dry-run is the default** —
only `--commit` writes.

**Locally (Node):**
```bash
npm --prefix server run import                 # dry run: shows only what would be written
npm --prefix server run import -- --commit     # actually write
# for a clean reimport: --commit --reset-imported
```

**Docker (live system):** mount the folder into a one-off container — it writes to
the same DB (`/data` volume). Build the image first (`docker compose build`).
```bash
# Dry run:
docker compose run --rm -v "$PWD/import:/import:ro" -e IMPORT_DIR=/import \
  mediary node dist/import.js
# Writing (stopping the server briefly avoids DB locks):
docker compose stop mediary
docker compose run --rm -v "$PWD/import:/import:ro" -e IMPORT_DIR=/import \
  mediary node dist/import.js --commit
docker compose start mediary
```

> Note: substance names are abbreviated as best as possible, with the **full
> original text kept in the note**. The 11 app scales now exactly match
> `konsum_tagebuch_skalen.md`. 09.06 is in `entries.jsonl` in messy form
> (final timeline + older correction messages as intakes) — quickly cross-check
> in the history.

---

## `DEFAULTS.md`

Default **notes and amounts** per substance. When a new intake is recorded
these are automatically applied if the amount or note was not explicitly given —
the explicit input always wins. The API reads the file **fresh on every write**
(no cache).

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

`Menge:` (alias `Dosis:`) → default amount, `Notiz:` (alias `Hinweis:`) →
default note; plain prose under the heading also counts as a note. The file
lives at the **project root** (`DEFAULTS.md`) and can also be edited from the
frontend's **Settings** screen.

### Companion substances (`Mit:`)

`Mit: <Name> | <Menge> | <Notiz>` (alias `Zusammen mit:`) automatically records a
**second intake** for the named companion substance when the main intake is
saved — same timestamp, amount/note optional (defaults come from the companion
substance's own DEFAULTS entry: its own DEFAULTS row). Multiple `Mit:` lines
are allowed. `Mit:` entries **on the companion** are not followed (one level
only, no cycles); self-references are skipped. The companion is auto-created
as a QuickPick if needed; its entry gets
`source_event_id = companion:<id-of-the-triggering-entry>`. If the companion is
a night medication, the daily assessment is also triggered. Applies only to
`POST /api/intakes` (not for the importer/XLSX/PATCH); `{"companions": false}`
in the request disables it. The response includes the created entries under
`companions[]`; the composer shows a preview ("Auto-added: …") and the undo
toast removes main and companion entries together.

> Programmatic rules from older notes have moved into the code: the
> **consumption day boundary (03:30 Europe/Berlin)** lives in
> `server/src/lib/time.ts` (`DAY_BOUNDARY`) and determines which day the daily
> assessment of a night medication is assigned to (intakes 00:00–03:29 → previous day).

### Automatic substance QuickPicks

Every substance that has ever been recorded via `POST /api/intakes` with
`substanceName` (e.g. from the WhatsApp importer or an external app) is
**automatically created as a tile** in the substance list. This is handled by
`server/src/lib/substances.ts → findOrCreateSubstance()`. At **server startup**
`backfillSubstancesFromIntakes()` also runs, retroactively linking existing
intakes without a `substance_id`; the importer does the same in one step after
`--commit`. Matching is Unicode-aware (`toLocaleLowerCase('de')`), so
`CBD-Öl` and `cbd-öl` end up together.

### DEFAULTS compliance check

`GET /api/defaults/check` compares **every substance** (from `substances` and
from `intakes`) against the entries in `DEFAULTS.md` and returns a split into
`compliant` (has an entry) and `missing` (no entry). The frontend uses this in
two places:

- On the **Today screen** a warning card at the top shows how many substances
  are missing a DEFAULTS entry; affected tiles get a small warning icon.
- In **Settings → Check: DEFAULTS.md** there's a list of all "missing"
  substances with an intake counter and an **"Add entry"** button that creates
  a new `## <Name>` section in the DEFAULTS editor with an empty `Notiz:` line
  and jumps the cursor there.

This turns maintaining `DEFAULTS.md` into part of the normal entry workflow
instead of a separate chore.

---

## Nightly "Dreaming" (daily assessment via MiniMax M3)

Every night at **04:20** the server sends the day's context (plan, intakes,
wake time, notes, 11 scales) to **MiniMax M3** and saves the result as a
"dream" per day. Without an API key nothing changes — the scheduler simply
doesn't start, the display continues to work.

### Enabling on an existing (older) instance

1. **Pull the new code** (`git pull`).
2. **Add the API key to `.env`** (project root):
   ```
   MINIMAX_API_KEY=sk-...
   # optional:
   DREAM_TRIGGER_TOKEN=<long-random-secret>   # for external/cron trigger
   DREAM_TIME=04:20                            # run time (local)
   ```
3. **Rebuild/start:** `docker compose up -d --build`. The server creates the
   `dreams` table on startup **idempotently** (no manual migration needed).

That's it. The next 04:20 run produces the first dream; missed days (e.g.
because the machine was off at night) are caught up automatically by a
**server-startup catch-up** for the last 7 days.

### Test immediately (without waiting for 04:20)

```bash
npm --prefix server run dream -- --force            # previous consumption day, overwrite existing
npm --prefix server run dream -- --date=2026-06-16  # specific day
```

> The key is used **server-side only**, never in the frontend. The manual HTTP
> trigger `POST /api/dreams/generate` is fail-closed: it requires the
> `DREAM_TRIGGER_TOKEN` (header `X-Dream-Token`) — behind a reverse
> proxy/tunnel "localhost" does **not** count as authentication. The complete
> variable list is in `.env.example`.

### Hermes agent daily report → dream + info sub-tab

In addition to the 11 scales and notes, the nightly "dreaming" knows about a
**Hermes agent daily report**: what the agent did during the day (coding
sessions, cron runs, deploys, errors, …). The report is delivered by the
**03:30 Berlin cron** via `POST /api/report/new` and flows to three places:

1. **Dream context** — `gatherDreamContext` pulls the target day's report
   **and** the most recent 7 reports (`reportsBefore`) as their own sections
   into the dream prompt. M3 can thus recognise patterns between agent
   activity and the day's well-being.
2. **Diary info sub-tab** — the report appears as its own "Hermes agent"
   section (Lucide icon `Bot`, with optional source marker). Long reports
   (> 600 characters) collapse behind a "Read more" — same threshold as the
   dream cards. Days with ONLY a report (no intakes / no assessment / no
   wake time) also show up.
3. **AI diary prompt** — `buildDayPrompt` passes the report on to the writing
   AI, so the generated full texts can also incorporate agent activity.

Default `date` = `dreamTargetDate(now)` (previous consumption day) — the 03:30
cron doesn't need to send anything and lands exactly on the day the dream is
produced for 42 minutes later.

**Cron example (in the Hermes host crontab):**

```bash
curl -fsS -X POST "${MEDIARY_URL}/api/report/new" \
  -H 'Content-Type: application/json' \
  -d "{\"report\":\"$(cat /var/log/hermes/daily-report.md)\",\"source\":\"hermes-cron-0330\"}"
```

**Manual entry (e.g. a missed day):**

```bash
curl -sS -X POST "${MEDIARY_URL}/api/report/new" \
  -H 'Content-Type: application/json' \
  -d '{"date":"2026-07-02","report":"Coding session: built X, fixed Y.","source":"manual"}'
```

---

## API reference (excerpt)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | Status |
| `GET` | `/api/metrics` | Definition of the 11 scales |
| `GET/POST` | `/api/substances` | List/create substances |
| `PATCH/DELETE` | `/api/substances/:id` | Edit / archive (`?hard=true` deletes) |
| `GET/POST` | `/api/intakes` | Read / create intakes (DEFAULTS logic) |
| `PATCH/DELETE` | `/api/intakes/:id` | Edit / delete |
| `GET` | `/api/plan` | Current plan |
| `GET` | `/api/plan/at?date=…` \| `?days=N` | Plan as of date |
| `GET` | `/api/plan/diff?days=N` | Diff vs. "N days ago" |
| `GET` | `/api/plan/versions` | Version history |
| `PUT` | `/api/plan` | Save a new plan version |
| `GET` | `/api/assessments?from=&to=` | Daily assessments (for trends) |
| `GET/PUT/DELETE` | `/api/assessments/:date` | Read / save / delete assessment |
| `GET/PUT` | `/api/defaults` | Read / write DEFAULTS.md |
| `GET` | `/api/defaults/check` | DEFAULTS compliance report (all substances with/without entry) |
| `GET` | `/api/diary/notes?from=&to=` | Short version: notes per consumption day (intake notes + assessment + wake time + **Hermes agent daily report**) |
| `GET` | `/api/diary` | State of the AI full diary |
| `POST` | `/api/diary/generate` | Generate AI full text |
| `PUT` | `/api/diary` | Manually overwrite the diary file |
| `GET` | `/api/habit?from=&to=` | Daily wake time (list) |
| `POST` | `/api/habit/uptime` | Report wake time |
| `GET` | `/api/dreams?from=&to=&limit=` | Dreams (nightly assessments) |
| `POST` | `/api/dreams/generate` | Manually generate a dream (`X-Dream-Token`) |
| `POST` | `/api/report/new` | **Hermes agent daily report** submit (`{ date?, report, source? }`); idempotent upsert per consumption day (default `date` = previous consumption day). Flows into the dream context and the diary info sub-tab. |
| `GET` | `/api/report?from=&to=&limit=` | Daily report list |
| `GET` | `/api/report/:date` | Single daily report |
| `DELETE` | `/api/report/:date` | Delete daily report |
| `GET` | `/api/chat/status` | Data console: availability |
| `POST` | `/api/chat/message` | **SSE** — natural-language request (CF-Access, rate-limited) |

`POST /api/intakes` returns additional `{ nightMed, assessmentDate, assessmentExists }` —
the frontend uses this to open the assessment sheet automatically after a night
medication.

---

## Android APK (Capacitor)

The frontend is Capacitor-ready. Build prerequisites: **Android Studio /
Android SDK** and a JDK (17+).

```bash
cd web
npm run build            # build web assets (web/dist)
npx cap add android      # one-time: create the Android project
npx cap sync android     # sync assets + plugins
npx cap open android     # open in Android Studio → build/run APK

# or directly via Gradle:
cd android && ./gradlew assembleDebug
# → android/app/build/outputs/apk/debug/app-debug.apk
```

In the app open **Settings → Server** and enter the API address
(e.g. `http://192.168.1.20:4000`). Plaintext HTTP on the home network is
already allowed via the Capacitor configuration (`cleartext`).

---

## Design

- **Typography:** *Fraunces* (display) + *Hanken Grotesk* (UI) — bundled
  locally, works offline in the APK.
- **Palette:** warm "pharmacy" tones, full-featured **light and dark mode**
  (native date/time pickers adapt via `color-scheme`).
- **Touch-first:** large hit targets, safe-area insets, haptics, "long-press =
  instant entry", floating confirmation, swipe-to-close sheets.
- Value trends rendered as hand-drawn SVG charts (no generic charting library).

---

## Data model (SQLite)

- `substances` — tappable list (color, `is_night_med`; default amount lives in `DEFAULTS.md`, not in the DB)
- `intakes` — intakes (timestamp, substance snapshot, amount, notes)
- `plan_versions` / `plan_items` — versioned plan (morning/noon/evening/night)
- `daily_assessments` — daily assessment per date (11 scales as JSON)
- `daily_habits` — daily wake time (`wake_first_unix`, `wake_last_unix`)
- `daily_reports` — **Hermes agent daily report** per consumption day (`report` free text, `source` marker) — submitted via `POST /api/report/new`, flows into dream + info sub-tab + AI diary
- `dreams` — nightly AI assessment per day
- `chat_change_sets` — audit log of the data console
