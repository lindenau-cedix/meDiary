# meDiary — Architecture

> Part of the meDiary project docs — overview & index in [CLAUDE.md](../CLAUDE.md).

## Key architectural points

- **Statistics analysis is (almost) entirely client-side & amount-conservative.**
  The `StatistikScreen` aggregates intakes / assessments / plan via
  `web/src/lib/analytics.ts` (no server endpoint). Free-text amounts
  (`amount`: "150 mg", "1 tablet", `null`) are split into number + unit via
  `parseAmount()` and **never summed across substances** — every dose sum
  is per substance and per dominant unit; substances without a consistently
  parseable amount fall back to count (intakes/day). Anyone adding new charts
  here must preserve this invariant (otherwise meaningless mg+piece sums appear).
- **Exception: the "ingredient balance" needs world knowledge (LLM) but computes
  deterministically.** To sum active ingredients (e.g. caffeine) across sources,
  the LLM delivers **once per substance** a cached profile (`substance_profiles`,
  `lib/ingredients.ts`): mg of active ingredient per serving + serving definition.
  Scaling up to the logged amount (`scaleServings` / `applyProfile` /
  `compoundReports` in `analytics.ts`) is pure client-side math — the LLM only
  estimates contents, it does not sum. The analysis trigger
  `POST /api/ingredients/analyze` is CF-Access-protected and runs **by default
  via the MiniMax subscription** (`config.ingredients` = `INGREDIENTS_API_KEY`
  > `CHAT_API_KEY` > `MINIMAX_API_KEY`, Anthropic-compatible MiniMax endpoint,
  `MiniMax-M3`) — no separate Anthropic key required. Technically the same
  `generateText` client as the AI diary, only with its own `client` config
  (`generateText({ …, client: config.ingredients })`). Unresolvable amounts
  are reported as "unquantified", not guessed.
- **DEFAULTS.md is re-read on EVERY write** (no cache). Parser:
  `server/src/lib/defaults.ts → parse()`. Supports `Menge:` / `Dosis:`,
  `Notiz:` / `Hinweis:`, and `Mit:` / `Zusammen mit:` (companion substance,
  format `Mit: Name | Menge | Notiz`, amount/note optional, multiple lines
  allowed); plain prose under a `## …` heading counts as a note. Case-insensitive
  match via `nameKey()` (Unicode-aware, `toLocaleLowerCase('de')`).
- **Companion substances (`Mit:`):** `POST /api/intakes` automatically creates
  a second intake for each `Mit:` line of the recorded substance — same
  timestamp, in one transaction with the main entry. Amount/note from the
  `Mit:` line take precedence, otherwise the companion substance's own DEFAULTS
  entry applies (DEFAULTS.md is the single source of truth for default amounts).
  Only one level deep (`Mit:` on the companion is not followed, self-reference
  skipped), auto-vivification like with the main entry,
  `source_event_id = companion:<main-id>`. If the companion is a night
  medication, the daily assessment is triggered. **`POST /api/intakes/text`
  does the same** per entry (no assessment field). Does NOT apply to the
  importer / XLSX import / PATCH / plan-batch; the request flag
  `companions: false` disables it per call.
- **Substance auto-vivification** (`server/src/lib/substances.ts`):
  - `findOrCreateSubstance(name)` is called from `POST /api/intakes` when a
    `substanceName` arrives without a `substanceId` → creates the substance
    if needed so it appears as a QuickPick.
  - `backfillSubstancesFromIntakes()` runs at **server startup** and at the
    end of `import.ts --commit`. Retroactively links intakes without a
    `substance_id` to their substance (or creates it).
  - `nameKey()` normalizes Unicode-aware — `CBD-Öl` and `cbd-öl` match.
    SQLite `lower()` is ASCII-only and is bypassed here.
- **Day boundary 03:30 Europe/Berlin** (`server/src/lib/time.ts → DAY_BOUNDARY`).
  Intakes 00:00–03:29 count toward the previous day. **Server**
  (`consumptionDay()` in `db.ts` / `time.ts`) AND **frontend**
  (`web/src/lib/time.ts`, same algorithm) know the boundary. Consequence:
  `intake.date` in the JSON (sent by `serializeIntake`) IS the consumption day;
  the today list in `QuickEntryScreen` filters locally
  `it.date === consumptionToday()`, so the 03:30 boundary holds safely in both
  directions (the SQL `from`/`to` filter works on wall-clock time).
  `allNightMedsTaken` in `db.ts` searches for consumption day `day` in the
  wall-clock range `dayT03:30:00 … (day+1)T03:29:59`, so the daily assessment
  is triggered exactly matching `consumptionDay(takenAt)`. `formatDayLabel`
  and `relativeDays` in the frontend compare against `consumptionToday()`,
  not the wall-clock day — a 02:30 intake shows up in the history as "Yesterday"
  (consumption day), not "Today" (wall-clock day).
- **Composer timestamp remains after submit** — `takenAt` is only set to "now"
  on the first mount of the QuickEntry screen via `useState(nowLocalInput())`.
  After a successful entry (including the "Morning meds"/"Night meds" batch
  entries) `takenAt` / `amount` / `note` of the main entry are preserved, so
  multiple substances can be entered with the same timestamp in succession. Only
  revisiting the Today tab (or clicking the "Now" button) resets the timestamp.
- **Plan versioning** is a full snapshot per version. The `plan_items` record
  has `version_id` and `substance_id` (NULL = free name).
- **Effective date `effective_from`** (`plan_versions`, `YYYY-MM-DD` or
  `YYYY-MM-DDTHH:mm`): plan changes can be recorded **retroactively** ("for X
  days now Y has been different") or **in the future** ("in X days Y becomes
  different") — independent of the recording time `created_at`. A pure date
  applies from 00:00; the lexicographic string comparison orders both formats
  correctly (`"2026-06-11" < "2026-06-11T08:00"`). `planVersionAt(at)` in
  `server/src/db.ts` resolves via `effective_from <= moment` (tie-break: higher
  `id` wins on equal value); `at = null` means "now" (full current time); a pure
  date as the as-of date is interpreted as **end of day** ("which plan was in
  effect on that day"). `upcomingPlanVersions()` compares against the current
  time — a version "today 23:50" stays `upcoming` until then. Migration:
  idempotent in `db.ts` (`ensureColumn` + backfill `effective_from =
  substr(created_at,1,10)`).
- **Habit / wake time** (`server/src/routes/habit.ts`, table `daily_habits`):
  The client cron reports via `POST /api/habit/uptime` a Unix timestamp for the
  earliest user interaction in the 24h window before the cron
  (`first_user_interaction_24h_unix`) and one for the last
  (`last_user_interaction_unix`). We derive from this **not** PC screen time,
  but the **wake time** of the previous day — wake up until fall asleep. The
  target date is **always the previous consumption day** from the webhook call's
  perspective (day boundary 03:30 Europe/Berlin, hard `today - 1`), independent
  of the concrete `last` wall-clock time. Algorithm:
    1. `intakeFirst` = latest intake of the target day in the interval
       `[day start 03:30, first)` (the intake must be after 03:30 and BEFORE
       `first` — it's the latest hint that the person was already awake before
       the first PC interaction was reported).
    2. `intakeLast` = latest intake of the target day (whenever).
    3. `wake_first_unix` = `intakeFirst` if found, otherwise
       `first_user_interaction_24h_unix`.
    4. `wake_last_unix`  = `max(intakeLast, last_user_interaction_unix)`.
  Intakes are searched in the wall-clock range
  `targetT03:30:00 … (target+1)T03:29:59` (consumption day range) and
  converted to Unix seconds via `new Date(iso).getTime()/1000` (local
  `new Date(iso)` = local wall-clock). Plausibility checks:
  `last <= now + 15 min` (clock skew) and
  `first >= now − 25 h` (true 24h window + slack). `wake_first` / `wake_last`
  feed into `gatherDiaryDays()` (short-form "wake time" block) and into
  `buildDayPrompt()`; **not** as screen time, but explicitly as the span from
  the first waking moment to the last waking moment (a comment in the AI prompt
  points the writing AI at this). Schema migration (`db.ts`, idempotent): old
  columns `pc_first_interaction_unix` / `pc_last_interaction_unix` are renamed
  to `wake_first_unix` / `wake_last_unix` via `ALTER TABLE … RENAME COLUMN`
  (SQLite ≥ 3.25); a fallback path for older SQLite versions (recreate table +
  copy) is provided.

## Dream delivery (WhatsApp + ElevenLabs)

As soon as `generateDream()` has saved a dream in the `dreams` table, the
**delivery layer** takes over:

```
04:20 cron → generateDream() → upsertDream() ─┐
                                              ├─→ enqueueDelivery() → deliverDream() per (dream_date, target)
                                              │     ├ whatsapp.sendText(jid, formatDreamForWhatsApp(content))
                                              │     └ elevenlabs.synthesize(toSpeechText) → ffmpeg MP3→Opus → whatsapp.sendVoiceNote({ptt:true})
                                              │
                                              └─→ dream_deliveries: status='sent' | 'failed' | 'abandoned'
```

**Components:**
- `lib/whatsapp.ts` — Baileys singleton. Persistent auth in
  `WHATSAPP_SESSION_PATH`. Idempotent `connect()`. `sendText` and
  `sendVoiceNote` throw `WhatsappNotConnectedError` when
  `state !== 'connected'`.
- `lib/elevenlabs.ts` — TTS client. Default model `eleven_multilingual_v2`,
  default voice `OO0WT3lY2gVNwzZMAjAI`. `synthesize(text)` → MP3,
  `mp3ToOpusOgg(mp3)` → Opus/OGG via ffmpeg.
- `lib/dream_delivery.ts` — orchestrator. `formatDreamForWhatsApp` converts
  the MiniMax Markdown (headings → `*bold*`, fenced blocks preserved, lists
  normalised, 4000-char truncate). `toSpeechText` strips WhatsApp Markdown
  and caps at `DREAM_VOICE_MAX_CHARS` (default 1500) for cost discipline.
- `routes/whatsapp.ts` + `routes/deliveries.ts` — admin / read API.

**Failure semantics:** text error → `status='failed'`, voice is not even
attempted. Text OK + voice error → `status='sent'`, `voice_status='failed'`,
error text stored. After `DREAM_DELIVERY_MAX_ATTEMPTS` (default 3) failed
attempts → `abandoned`. `retryFailedDeliveries()` runs on server startup and
retries all `failed` rows of the last `DREAM_DELIVERY_RETRY_DAYS` (default 7).

**Idempotency:** `INSERT OR IGNORE` on
`uq_deliveries_dream_target (dream_date, target_id)` prevents duplicate rows.
`insertOrGetDelivery` is concurrency-safe.

**Decoupling:** dream generation and WhatsApp delivery are fully separated. A
WhatsApp outage at 04:20 doesn't cost a dream — `upsertDream` is already
committed, the delivery waits for the next boot sweep or manual retry.

## DEFAULTS compliance — checker & UI

`GET /api/defaults/check` returns:

```json
{
  "checkedAt": "2026-06-10T...",
  "defaultsAvailable": true,
  "total": 9,
  "compliant": [{ "name": "Lithium", "intakeCount": 12, "inSubstances": true, "hasDefault": true, "matchedKey": "lithium" }],
  "missing":   [{ "name": "Mirtazapin", "intakeCount": 3, "inSubstances": true, "hasDefault": false, "matchedKey": null }]
}
```

Sorting: missing first, then by intake frequency, then alphabetically.
Frontend UI:

- `web/src/screens/QuickEntryScreen.tsx` shows a **warning card** at the top
  when substances without a DEFAULTS entry exist; affected tiles get a small
  `AlertCircle` badge in the top-left corner.
- `web/src/screens/SettingsScreen.tsx` has a new section
  **"Check: DEFAULTS.md"** with badges ("X with entry", "Y without entry")
  and a list of missing substances. Each entry has an **"Add entry"** button
  that inserts `## <Name>\nNotiz: \n` into the DEFAULTS editor and jumps the
  cursor there (toast / focus scroll).
- On saving the DEFAULTS file (`useSaveDefaults`) the compliance query key is
  invalidated; the UI updates automatically.

## Database schema (SQLite)

| Table | Purpose |
|---|---|
| `substances` | Tappable list (color, `is_night_med`, order via `sort_order`, soft-archive via `archived_at`). **Default amount does NOT live here** — it lives in `DEFAULTS.md` (column `default_dose` is decommissioned, only kept for the undo snapshot restore in the schema) |
| `intakes` | Intakes (timestamp, substance snapshot with `substance_id` + `substance_name`, amount, notes) |
| `plan_versions` | Plan snapshots (`created_at` = recorded, `effective_from` = valid from) |
| `plan_items` | Plan rows (morning / noon / evening / night) per version |
| `daily_assessments` | Daily assessment (11 scales as JSON, primary key `date`) |
| `daily_habits` | Daily **wake time** (`wake_first_unix`, `wake_last_unix`, both nullable) per consumption day — see "Habit / wake time" section |
| `dreams` | Nightly AI assessment ("dream") per consumption day (PK `date`, `content`, `model`, `status`, `created_at`, `updated_at`) — see "Nightly dreaming" section / change 2026-06-17 |
| `daily_reports` | Hermes agent daily report (PK `date`, `report` free text, `source` marker, `created_at` / `updated_at`) — submitted via `POST /api/report/new` by the 03:30 Berlin cron, feeds into the dream context |

Indices: `idx_intakes_taken_at`, `idx_intakes_source` (import idempotency),
`idx_plan_items_version`, `idx_plan_versions_source`, `idx_plan_versions_effective`.

## Frontend structure

```
web/src/
├── App.tsx                 # Router + Theme + QueryClient
├── main.tsx
├── screens/
│   ├── QuickEntryScreen.tsx    # Today: composer (multi-select) + tile grid + assessment
│   ├── HistoryScreen.tsx       # History grouped by day
│   ├── DiaryScreen.tsx         # Diary: short (note list) / full (AI-generated)
│   ├── PlanScreen.tsx          # Medication plan + history + diff
│   ├── TrendsScreen.tsx        # 11-scale trends (SVG)
│   ├── StatistikScreen.tsx     # Visual consumption analysis (7 modules, inline SVG)
│   └── SettingsScreen.tsx      # Theme, substances, server, DEFAULTS.md, compliance
├── components/                 # UI building blocks (Sheet, Card, Button, Toaster, …)
│   └── charts/                 # Dependency-free SVG primitives (VBars, HBars,
│                               #   Punchcard, DaypartChart, DualAxis) for Statistics
├── lib/
│   ├── api.ts                  # fetch wrapper + ApiError
│   ├── queries.ts              # react-query hooks
│   ├── analytics.ts            # Statistics aggregators (parseAmount, ranking,
│   │                           #   dailyDoseSeries, daypart, pearson) — pure, testable
│   ├── types.ts                # API types
│   ├── time.ts                 # DAY_BOUNDARY, consumptionDay, consumptionToday, parseLocal, nowLocalInput
│   ├── format.ts               # re-exports time helpers, greeting, formatTime, formatDayLabel, …
│   ├── colors.ts, theme.tsx    # Design tokens / theme persistence
│   ├── haptics.ts, native.ts   # Capacitor haptics
│   └── widgetBridge.ts         # Capacitor plugin wrapper: mirrors API URL
│                               #   into native SharedPreferences (for Android widget)
└── index.css                   # CSS variables, Tailwind layers

web/android-native-src/          # Native Android widget sources (NOT part
                                # of the Capacitor scaffold). Merged by the
                                # bundled install.sh after `cap add android`
                                # into web/android/app/src/main/:
                                #   widget/SampleWidgetProvider.kt        (AppWidgetProvider)
                                #   widget/SampleWidgetConfigActivity.kt (configuration UI)
                                #   widget/SampleSendReceiver.kt          (tap → POST /api/intakes + toast)
                                #   widget/ApiClient.kt                   (OkHttp + CF cookie mirroring)
                                #   widget/SampleWidgetPrefs.kt           (SharedPreferences schema)
                                #   bridge/WidgetBridgePlugin.kt          (Capacitor plugin for API URL mirror)
                                #   res/{xml,layout,drawable,values}/    (provider metadata, layouts, …)
```
