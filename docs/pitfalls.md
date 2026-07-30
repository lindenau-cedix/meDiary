# meDiary — Known pitfalls

> Part of the meDiary project docs — overview & index in [CLAUDE.md](../CLAUDE.md).

## Known pitfalls

- **Two `data/` directories:** `./data` in the project root is the
  Docker volume with the **live database** — never delete or use for tests.
  `server/data` is the local dev default (`DB_PATH` relative to `server/`).
  Run smoke tests always with an explicit `DB_PATH` pointing to `/tmp`.
- **SQLite `lower()` is ASCII-only** — `lower('Ö')` stays `Ö`. For correct
  umlaut matching `nameKey()` in JS is mandatory; never write
  `lower(name) = lower(?)` queries again.
- **DEFAULTS.md is read live** — no need to restart the server after a change,
  but also no reload logic in the client is needed (the server reads fresh per
  request).
- **The default amount lives ONLY in DEFAULTS.md, not in the DB.** The
  `defaultDose` field of the substance UIs writes via `upsertSectionAmount()`
  to `DEFAULTS.md`; `substances.default_dose` is decommissioned (kept only for
  the undo snapshot restore in the schema, never read as an authority). The
  new resolution chain everywhere: `explicit > DEFAULTS.md`. Anyone wanting to
  pre-fill a dose MUST have a `Menge:` entry in `DEFAULTS.md` — a value in the
  DB column is ignored. On the first server start after this refactor
  `migrateDefaultDosesToDefaultsFile()` migrates old DB values into the file
  once (existing `Menge:` wins).
- **`Mit:` companion substances apply to `POST /api/intakes` AND
  `POST /api/intakes/text`** — the importer, XLSX replace and PATCH deliberately
  do not create companion intakes (history stays history); `plan-batch` also
  does not (the plan is the authoritative list). Exactly one level is resolved:
  `Mit:` lines on the companion are ignored, `Mit: <substance itself>` likewise.
  A substance referenced via `Mit:` without its own `## …` section appears in
  the compliance check after the first auto-entry as `missing` — intentional
  (a prompt to maintain it). For `/text` there is NO cross-line deduplication:
  if a line names the companion separately (e.g. "Theanin, Lemon Balm"), two
  Lemon Balm entries are created (main + companion) — like two separate
  `POST /` calls; `companions: false` suppresses the automatic ones.
- **`plan-batch` records exactly the plan substances of the slot** — no
  `Mit:` companion substances (otherwise duplicates, if a companion is already
  in the plan). The plan effective at `takenAt` is authoritative; a substance
  dosed both morning and night (e.g. Lithium) is recorded once by each batch
  entry (two intakes, intentional). In the frontend the tiles appear only when
  the plan prescribes something for the slot.
- **`/api/intakes/text` is the only authenticated endpoint** — the rest of the
  API is intentionally open (private deployment). The CF-Access check is
  fail-closed: without `CF_ACCESS_TEAM_DOMAIN` + `CF_ACCESS_AUD` → 503. For
  local smoke tests set `CF_ACCESS_DISABLED=true`. `Mit:` companion substances
  are recorded here — unlike the earlier behavior — (as with `POST /`,
  switchable off with `companions: false`); no `nightMed` / assessment field
  in the response (external automation, no UI). Repeatedly sending the same
  text produces duplicates — there is deliberately no idempotency
  (`source_event_id = text:<timestamp>` is only a batch marker for finding /
  cleaning up; companion entries carry `companion:<main-id>`).
- **`POST /api/dreams/generate` is token-primary & fail-closed** — loopback is
  NOT auth, as soon as a reverse proxy / cloudflared tunnel sits in front of
  the server (every external request comes in via 127.0.0.1 there). Therefore:
  a valid `X-Dream-Token` (header, constant-time compared) is mandatory;
  without a token & without explicit `DREAM_TRUST_LOOPBACK=true` → 403, even
  from localhost. Set `DREAM_TRUST_LOOPBACK` only for purely local
  deployments without a proxy in front. `trust proxy` must stay off (the
  route deliberately reads `req.socket.remoteAddress`, not `req.ip`).
  Rate limit via `DREAM_MIN_INTERVAL_MS` (default 10s → 429). The in-process
  scheduler needs NO token — it calls `generateDream` directly.
- **`is_night_med` triggers the daily assessment** — `consumptionDay(takenAt)`
  rolls 00:00–03:29 into the previous day. This happens here, not in the
  frontend.
- **Daily assessment trigger: all night meds of the current plan** — the
  daily assessment is NO LONGER triggered when a substance with `is_night_med=1`
  is recorded. Instead `POST /api/intakes` checks after every record whether
  ALL night meds (`night` slot) of the currently effective plan for the
  consumption day have already been taken (`allNightMedsTaken(day)` in
  `db.ts`). Only when all are present is `nightMed=true` and `assessmentDate`
  set in the response. Applies to EVERY substance record as soon as the
  plan-complete state is reached — non-night-med substances also trigger the
  daily assessment then.
- **Import `entries.jsonl` covers only gaps** — Markdown has priority; a jsonl
  entry is skipped if (day, time) or (day, substance) is already present from
  Markdown.
- **Soft archive:** `DELETE /api/substances/:id` without `?hard=true` only
  sets `archived_at`. `findOrCreateSubstance` does not reactivate archived
  substances — deliberate, so removed tiles stay removed.
- **`effective_from` vs. `created_at`:** for "which plan was in effect when",
  only `effective_from` counts. A retroactive version only covers older
  versions up to the next higher effective date — example: v2 is valid from
  06-06, a new v3 "from 06-01" then only applies 06-01 to 06-05. For "valid
  since X days up to today" the effective date must be after that of the
  previous current version (the normal case). On an equal effective date the
  higher `id` wins.
- **Docker Compose overrides data paths:** inside the container
  `DB_PATH=/data/mediary.db`, `DEFAULTS_PATH=/data/DEFAULTS.md`,
  `DIARY_PATH=/data/diary.md` and `WEB_DIST=/app/web/dist` apply, even if older
  local values stand in `.env`. This ensures that user data lands in the repo
  root under `./data`.
- **`WEB_DIST`:** relative paths from `.env` are resolved against
  `process.cwd()` (not against `SERVER_ROOT`). In the Docker image the fixed
  value `/app/web/dist` is set. For local Node starts the relative path depends
  on the working directory: for `node server/dist/index.js` from the repo root
  `WEB_DIST=./web/dist`, for `npm run start` via the root script because of
  `npm --prefix server` instead `WEB_DIST=../web/dist`.
- **The Android sample widget does not respond in deep Doze / Doze standby** —
  on stock Android the `BroadcastReceiver` with `goAsync()` works without
  issues, as long as the device doesn't aggressively go into standby (some
  custom ROMs / battery saver apps). In practice the tap delay is at most a
  few seconds, because the home-screen tap wakes the app process. Acceptable.
- **The Android sample widget shows NO preview of the last entry.** The tile
  shows exclusively the **configured** substance + amount, not the *most
  recently recorded* intake. To see the tap history you must open the app
  (`Today` tab). Deliberate simplification in v1.
- **Android sample widget: no undo from the home-screen tap.** The in-app
  `Undo` toast (`QuickEntryScreen.tsx`) is the only correction path for a
  misclick. If you miss it, the entry stays (deletable via the history list).
  Multi-substance entries need multiple widgets side by side; a "raw free
  text" variant (`POST /api/intakes/text`) remains for v2.
