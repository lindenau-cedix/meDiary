# meDiary — Recent Changes (Detailed History)

> Originally written in German; entries below were translated for the bilingual UI rollout. Entries predate the English UI.

> Part of the meDiary project documentation — overview & index in [CLAUDE.md](../CLAUDE.md).

## Recent Changes (newest first)

- **2026-07-29 — AI "Compound Balance": total consumption of an active ingredient across all sources**:
  - **Why:** Statistics could only show amounts per substance. A question like "how much
    **caffeine** do I consume in total?" (from energy drink + cola + coffee + tablet)
    could not be answered — that requires world knowledge about the active ingredient
    content per source.
  - **Architecture (smart + cheap):** The LLM provides **once per substance** a cached
    "recipe" — how much of an active ingredient is in ONE typical serving + a serving
    definition (unit, optional ml/g). The **extrapolation to the actually logged
    free-text amount is done deterministically by the client** (reading dose AND note),
    summed across sources per active ingredient. No model call per analysis; re-analysis
    only on changed input (`input_hash` → "stale").
  - **Server:** new table `substance_profiles` (cache, PK = nameKey) + helpers in `db.ts`;
    `lib/ingredients.ts` (collect input per substance from DEFAULTS amount/note + observed
    examples, prompt with canonical active ingredient keys + few-shot, zod-validated
    JSON parsing tolerant of code fences/prose, chunking in batches of 25);
    `routes/ingredients.ts`: `GET /api/ingredients` (open: profiles + missing/stale),
    `POST /api/ingredients/analyze` (Cloudflare Access + 503 guard + in-process busy lock;
    `scope` missing|all). **Runs by default via the MiniMax subscription** (`config.ingredients`:
    `INGREDIENTS_API_KEY` > `CHAT_API_KEY` > `MINIMAX_API_KEY`; Anthropic-compatible
    MiniMax endpoint `…/anthropic`, model `MiniMax-M3`) — same as the data console, so
    **no Anthropic key needed**. For this, `generateText` (lib/anthropic.ts) now takes
    an optional `client` param (`AnthropicClientConfig`), default still `config.anthropic`
    (AI diary unchanged).
  - **Client:** `analytics.ts` → `scaleServings` (unit conversion mg↔g, ml↔l,
    serving `milliliters`/`grams`, countable unit → number of servings), `applyProfile`,
    `compoundReports` (daily series + source breakdown + "unquantified" counter),
    `equivalentFor` ("≈ N cups of coffee"). New statistics module **Compound Balance**:
    AI analysis button (status/model), active ingredient chips, mg/g headline + comparison
    value, daily bars, **source ranking** (which source contributes how much),
    "How the AI calculates this" transparency per source, note "Estimate ≠ lab value".
    Types/api/queries (`useIngredients`, `useAnalyzeIngredients`) added.
  - **Invariant:** Active ingredient sums apply per canonical `compound` key; amounts
    that cannot be resolved are NOT estimated, but reported as "N intakes not included"
    (honest rather than invented).
  - **Verification:** `typecheck:all` + `web build` green; 22 scaling/aggregation +
    13 parse smoke assertions green; E2E against `/tmp` DB: `GET /api/ingredients` returns
    state, `POST /analyze` without key → 503, table is created.

- **2026-07-29 — New "Statistics" section (graphical consumption analysis)**:
  - **Why:** Intakes & daily assessments were previously only visible as lists
    (history, values). A graphical analysis that shows patterns at a glance
    ("when was how much of what consumed", time-of-day rhythm,
    plan adherence, correlation with well-being) was missing.
  - **New:** 6th bottom-nav tab **`/statistik`** (icon `BarChart3`). Charts
    dependency-free as inline SVG (like `TrendChart`) — **no charting library**,
    offline-APK-capable, warm night palette. Everything aggregated client-side
    from existing endpoints — **no new server/DB code**.
  - **Files:** `web/src/lib/analytics.ts` (pure aggregation/math layer:
    `parseAmount` for free-text amounts including ranges/comma/plural, rankings,
    daily dose series with dose/count fallback, time-of-day distribution, Pearson
    correlation); `web/src/components/charts/` (VBars, HBars, Punchcard,
    DaypartChart, DualAxis + barrel); `web/src/screens/StatistikScreen.tsx`.
    Changed: `App.tsx` (route), `BottomNav.tsx` (tab).
  - **7 modules:** KPI band · **Consumption calendar** (punchcard substance×day,
    opacity = intakes/day relative to its own peak, tap detail) · **Amount over time**
    (per substance in *its* unit — free-text amounts are **never summed across
    substances**; count fallback for amounts that cannot be parsed consistently) ·
    **Top substances** (horizontal ranking bars) · **Time-of-day pattern**
    (Morgens/Mittags/Abends/Nachts + 24-hour histogram) · **Plan adherence over time**
    (share of planned intakes per day; reuse `isPlanIntake` + time-accurate
    version recency indexing from `HistoryScreen`) · **Substance × well-being**
    (daily dose vs. 11-scale dimension, dual-axis overlay + Pearson `r` with
    plain-text assessment and explicit note **"Correlation ≠ causation"**).
  - **Readability by design:** Substance color as consistent identity, direct
    labelling instead of axis jungle, sorted by relevance (long lists collapsible),
    responsive `viewBox` (fits in the `max-w-app` column, no zoom), 7/30/90/180-day
    toggle (like "Values").
  - **Verification:** `typecheck:all` + `web build` green; 39/39 analytics smoke
    assertions (parseAmount, ranking, dose/count series, time-of-day, Pearson, punchcard).

- **2026-07-22 — "Planned" is now dose-accurate (history + daily assessment trigger)**:
  - **Problem 1 (history):** The "Plan" badge (History + QuickEntry "Logged today")
    appeared as soon as the **substance** was in the plan — regardless of
    the dose. A deviation (e.g. 300 mg instead of 150 mg) was not detectable.
  - **Problem 2 (daily assessment):** The 11-scale assessment was triggered as soon
    as `takenNightMeds.length >= planned.length` — a **count check** that two
    intakes of the SAME night medication could trick, even though another
    night medication was still missing.
  - **Now:**
    - **Dose match:** New, comparison-tolerant `doseKey()` (umlauts,
      whitespace, unit spacing, comma/dot, `–—−` dashes, `%`) — as
      server mirror `server/src/lib/doses.ts` ↔ `web/src/lib/plan.ts`
      (analogous to the `nameKey()` mirror). `planDoseIndex()` collects per substance
      the allowed doses (slots + `strength`); `isPlanIntake(intake, index)`
      requires substance **and** dose. If a concrete plan dose is missing
      (only "✓"), the substance match is sufficient; pure piece counts from the slots
      (form model, `plan-batch` logs them as `amount`) deliberately
      still count as planned amounts.
    - **Time-accurate:** History measures each intake against the plan version
      **effective** at its `takenAt` (not today's plan) — otherwise a
      intake that was correct at the time would lose the badge after a dose change.
      For this, `GET /api/plan/versions?withItems=1` returns all versions including
      items; `usePlanVersionsWithItems()` + resolution `effective_from ≤ takenAt`
      (mirror of `planVersionAt`, tiebreak `id DESC`).
    - **Night-med completeness dose-accurate:** `allNightMedsTaken()` now checks
      whether **each** planned night medication was taken AND its
      amount matches the plan dose (night slot or `strength`). No more
      count check, no duplicate pretense; wrong dose ⇒ daily assessment
      stays out until the plan dose is logged.
  - **Files:** `server/src/db.ts` (`allNightMedsTaken`), new
    `server/src/lib/doses.ts`, `server/src/routes/plan.ts` (`?withItems=1`),
    `web/src/lib/plan.ts`, `web/src/lib/{api,queries,types}.ts`,
    `web/src/screens/{HistoryScreen,QuickEntryScreen}.tsx`.
  - **Deliberately left open:** The dream context section "Unplanned consumption"
    (`lib/dreams.ts`) continues to classify only by name — a
    dose deviation is not an "unplanned" substance and would need its own
    category in the prompt.
  - **Verified:** `typecheck:all` clean; smoke tests against `/tmp`
    (night-med completeness: duplicate without 2nd med → no trigger, wrong
    dose → no trigger, count slot "1" & upper/lower case → trigger; dose match:
    exact/without-space/case/range → badge, deviation/`null` → none;
    time-accurate resolution: old 100 mg intake keeps badge despite
    today's 150 mg plan; `?withItems=1` endpoint returns items).

- **2026-07-21 — Default dose: single source of truth in DEFAULTS.md**:
  - **Problem:** The "default dose" of a substance existed twice — in the
    DB column `substances.default_dose` (populated by the substance form) AND
    as `Menge:` in `DEFAULTS.md`. When creating a substance, the dose
    only landed in the DB, never in `DEFAULTS.md`. It still worked
    (resolution chain `explicit > default_dose > DEFAULTS`), but the file
    was no longer the truth, and the compliance check falsely reported such
    substances as "missing".
  - **Now:** `DEFAULTS.md` is the **only** source for default amounts.
    - `POST/PATCH /api/substances` writes `defaultDose` via the new
      helper `upsertSectionAmount()` losslessly as `Menge:` to
      `DEFAULTS.md` (note/`Mit:`/`preLines`/`postLines` remain untouched);
      the DB column is filled with `NULL`. On rename,
      `clearSectionAmount()` removes the amount under the old name.
    - `serializeSubstance` reads `defaultDose` via `defaultAmountFor(name)`
      from the file — so both substance UIs (`SubstanceManager`,
      `AddSubstanceSheet`) and QuickEntry remain functionally unchanged.
    - All resolution chains in `routes/intakes.ts` (POST `/`, `/text`,
      `/batch`, `plan-batch` + their `Mit:` companions) are now reduced to
      `explicit > DEFAULTS.md`; the `chat_tools` fallbacks for
      `backfill_intakes` now read `defaultAmountFor()`.
    - **Boot migration** `migrateDefaultDosesToDefaultsFile()` (in `index.ts`,
      next to the substance backfill): transfers existing `default_dose` values
      to `DEFAULTS.md` (existing `Menge:` wins on conflict) and empties
      the column. Idempotent — a second start does nothing.
  - **DB column:** `substances.default_dose` remains in the schema (no
      destructive `DROP`), but is never read/written as authority again
      — only the undo snapshot restore in `chat_tools` still touches it.
  - **Files:** `lib/defaults.ts` (helper + migration), `lib/serialize.ts`,
    `routes/substances.ts`, `routes/intakes.ts`, `lib/chat_tools.ts`,
    `index.ts`. No frontend rebuild needed.
  - **Verified:** `typecheck:all` clean; smoke tests against `/tmp`
    (create + PATCH → `DEFAULTS.md` with preserved note/`Mit:`, DB column
    NULL; migration including conflict priority + idempotency; intake without amount
    correctly pulls dose from `DEFAULTS.md`).

- **2026-07-21 — Structured DEFAULTS.md editor**:
  - **What:** The only editing surface for `DEFAULTS.md` was previously
    a raw `<TextArea>` in `SettingsScreen` — error-prone for anyone
    who doesn't regularly work with the Markdown structure.
  - **Now:** Dedicated screen `/standardnotizen` with two tabs:
    *Structured* (per substance a form for `Menge`, `Notiz`,
    `Mit:` companions + `[NACH/DAVOR …]` caveats that are carried along
    losslessly as `preLines`/`postLines`) and *Advanced (Markdown)*
    (the previous raw text editor as a power-user escape hatch).
    `SettingsScreen` keeps the compliance card with the new "Edit"
    button — this now navigates directly to the new section with
    the substance name pre-selected.
  - **Backend:** New endpoint `PUT /api/defaults/sections`
    (zod-validated, **Cloudflare Access**, fail-closed). Input:
    `{ sections: [{ name, amount?, note?, companions: [{name, amount?, note?}], preLines: string[], postLines: string[] }] }`.
    Server is the only serializer — prevents drift between two
    write paths. Existing raw `PUT /api/defaults` remains as
    power-user fallback.
  - **Validation:** Duplicate names (case-insensitive via `nameKey()`),
    missing/empty names, too-long fields (`Menge` ≤ 80, `Notiz` ≤ 1000
    characters), self-reference as companion → 400.
  - **Round-trip:** `parseSections()` / `buildMarkdownFromParsed()`
    preserve preamble (title + explanation) and unstructured lines
    (`NACH …:` caveats) losslessly. Smoke tests against `/tmp` show:
    complete create + edit + save, concurrent running
    `POST /api/intakes` immediately pick up the new defaults
    (file read fresh, no cache).
  - **Files:**
    - Server: `server/src/lib/defaults.ts` (`parseSections`,
      `buildMarkdownFromParsed`, `validateSections`), new
      `SectionInput`/`ParsedSections` types,
      `server/src/routes/defaults.ts` (`PUT /sections`).
    - Web: `web/src/components/DefaultsEditor/{index, StructuredView,
      SubstanceSection, CompanionRow, ErweitertView, AddSubstanceSheet,
      SaveBar, state}.tsx`,
      `web/src/screens/DefaultsEditorScreen.tsx`, route entry
      `/standardnotizen` in `web/src/App.tsx`,
      `web/src/lib/names.ts` (client mirror of `nameKey()`),
      `api.defaults.saveSections` + `useSaveDefaultsSections`.
  - **No new npm dependency.** Pure React/JS solution, mirrors the
    dependency-light style of the app (`CLAUDE.md`).

- **2026-07-12 — WhatsApp delivery + ElevenLabs voice**:
  - **What:** The nightly "dream" was previously shown in the app as a popup + dream tab.
    The reading surface was the web UI.
  - **Now:** Every generated dream is delivered **via WhatsApp** — as
    formatted text message (WhatsApp Markdown) AND as native
    **voice note** (Opus/OGG, in the WhatsApp voice note player). WhatsApp is
    now the primary reading surface; the app only shows a
    "Sent dreams" log with status (sent / failed / abandoned / pending).
  - **Architecture:**
    - **Server:** `server/src/lib/whatsapp.ts` (Baileys singleton, QR pairing,
      persistent auth in `WHATSAPP_SESSION_PATH`), `server/src/lib/elevenlabs.ts`
      (TTS client, ElevenLabs `eleven_multilingual_v2`), `server/src/lib/ffmpeg.ts`
      (MP3 → Opus/OGG transcoder), `server/src/lib/dream_delivery.ts`
      (orchestrator + Markdown→WhatsApp formatter), `server/src/routes/whatsapp.ts`
      + `server/src/routes/deliveries.ts` (admin API), new tables
      `delivery_targets` + `dream_deliveries`.
    - **Pipeline:** `04:20 cron → generateDream() → upsertDream() →
      enqueueDelivery() → formatDreamForWhatsApp() → whatsapp.sendText() +
      ElevenLabs.synthesize() → ffmpeg MP3→Opus → whatsapp.sendVoiceNote({ptt:true})
      → dream_deliveries.status='sent'`.
    - **Web:** `web/src/components/SentDreamsLog.tsx` (replaces `DreamHistory`
      in the diary tab), `web/src/components/SentDreamDrawer.tsx`
      (slide-in with "Resend"),
      `web/src/components/AdminWhatsappPanel.tsx` (QR pairing, test message,
      recipient management — visible only when `ADMIN_UI_ENABLED=true`). The
      `DreamStartupDialog` is deleted.
    - **Failure isolation:** Text and voice note are tracked independently.
      If voice synthesis fails, the message still counts as delivered
      (UI shows "Voice note failed"). If text delivery
      fails, the dream is not lost — it's already stored in the `dreams`
      table, and `retryFailedDeliveries()` (boot sweep) tries again
      up to 3×. After 3 failures: `abandoned`.
  - **New env variables:** `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` (default
    `OO0WT3lY2gVNwzZMAjAI`), `ELEVENLABS_MODEL`, `ELEVENLABS_BASE_URL`,
    `ELEVENLABS_OUTPUT_FORMAT`, `ELEVENLABS_HTTP_TIMEOUT_MS`, `WHATSAPP_DISABLED`,
    `WHATSAPP_SESSION_PATH` (Docker: `/data/whatsapp-session`),
    `DREAM_DELIVERY_DISABLED`, `DREAM_DELIVERY_MAX_ATTEMPTS`,
    `DREAM_DELIVERY_RETRY_DAYS`, `DREAM_VOICE_TIMEOUT_MS`, `DREAM_VOICE_MAX_CHARS`,
    `ADMIN_UI_ENABLED`.
  - **New dependencies (server):** `@whiskeysockets/baileys@^7.0.0-rc.13`,
    `pino@^9.5.0`, `qrcode@^1.5.4`, `@hapi/boom@^10.0.1`. Docker: `ffmpeg` added to
    runtime image.
  - **ToS warning:** Baileys is unofficial. WhatsApp may block the number.
    A dedicated second SIM is recommended for production.
  - **Files (complete):** See git diff. All tests green:
    `npm run typecheck:all` exit 0.

- **2026-07-09 — Android home screen widget "meDiary-Sample" (1×1)**:
  - **Feature:** 1×1 widget that sends a pre-configured intake via tap to
    `POST /api/intakes` and shows a toast
    (`Erfasst: Quetiapin 50 mg`). Multiple instances, each with its own
    binding (substance + amount + time of day). Configuration via the
    Android standard widget config activity (system flow "Add widget"
    or long-press → Configure).
  - **Endpoint choice:** `POST /api/intakes` (single, **not** behind
    `requireCloudflareAccess`) instead of `POST /api/intakes/text` — per
    widget exactly one substance is bound, the
    free-text parsing multiline handling is unnecessary, and the endpoint
    is directly reachable in the LAN deployment with `CF_ACCESS_DISABLED=true`.
    On the server side, `Mit:` companions and DEFAULTS default dose
    apply as with the in-app `submitInstant` button.
  - **Authentication:** `ApiClient.attachCookie()` forwards the
    `CF_Authorization` cookie from the WebView cookie manager both as
    `Cookie` header and canonically as
    `Cf-Access-Jwt-Assertion` header. On HTTP 401, the widget
    opens the app (`MainActivity`) so the WebView can log in again;
    afterwards the widget works again.
  - **API base mirroring:** New Capacitor plugin
    `app.mediary.bridge.WidgetBridgePlugin` with method `setApiBase()`,
    which writes the URL to `SharedPreferences("mediary_widgets")`. The
    web calls the plugin after every `getApiBase()`/`setApiBase()`
    (`web/src/lib/widgetBridge.ts` + patch in `web/src/lib/api.ts`), so
    that the widgets know the URL **before** the user has ever opened
    the app. No-op in browser mode.
  - **Native sources:** Located in `web/android-native-src/` (NOT
    part of the Capacitor scaffold) — five Kotlin classes plus a
    bridge plugin, XML layouts, drawables, provider metadata,
    strings/colors, and an `install.sh` that merges the sources idempotently
    into `web/android/app/src/main/` after `cap add android`
    (Kotlin → `java/`, XML → `res/`, manifest fragment
    `Config-Activity` + `Provider-Receiver` is inserted before `</application>`,
    `androidx.appcompat:appcompat:1.7.0` +
    `com.squareup.okhttp3:okhttp:4.12.0` are added to `app/build.gradle`
    if not already present).
  - **Files:**
    `web/android-native-src/{README.md,install.sh,manifest-fragment.xml}`,
    `web/android-native-src/app/src/main/java/app/mediary/widget/{SampleWidgetProvider,SampleWidgetConfigActivity,SampleSendReceiver,ApiClient,SampleWidgetPrefs}.kt`,
    `web/android-native-src/app/src/main/java/app/mediary/bridge/WidgetBridgePlugin.kt`,
    `web/android-native-src/app/src/main/res/{xml/sample_widget_info,layout/widget_sample,layout/activity_widget_config,drawable/widget_background,drawable/widget_preview}.xml`,
    `web/android-native-src/app/src/main/res/values/{strings,colors}.xml`,
    `web/src/lib/widgetBridge.ts`,
    `web/src/lib/api.ts` (2 places).
    Docs: `docs/deployment.md` (new section "Android widget"),
    `docs/architecture.md` (directory tree extended),
    `docs/pitfalls.md` (short entry on deep doze and missing
    preview of the last entry).
  - **Verification:** Since the sandbox environment has no JDK and no
    Android SDK, the `gradlew assembleDebug` build was not
    executed here. The install procedure is documented in
    `web/android-native-src/README.md` step by step;
    anyone with an Android device + SDK can use
    `./android-native-src/install.sh && npm run build && npm run cap:sync
    && cd android && ./gradlew assembleDebug` to build and
    install the APK.

- **2026-07-04 — Hermes agent daily report → dream context
  (assignment `/add-report-api-route`)**:
  - **Feature:** New endpoint `POST /api/report/new` accepts a daily report
    from the Hermes agent ("what did I do with the agent today?") and
    makes it available for the nightly "dreaming" — in addition to the
    11 daily scales and free-text notes.
  - **Info subtab:** The daily report is also rendered in the diary info
    subtab (`web/src/screens/DiaryScreen.tsx`) as its own "Hermes agent"
    section (Lucide icon `Bot`, with optional source attribution). Long
    reports (> 600 characters) collapse behind a "Read more" button just
    like the dream cards — whitespace normalized (`\n{3,}` → `\n\n`) so
    multi-line reports sit cleanly. Days with ONLY a report (no intakes
    / no daily picture / no wake time) also appear in the info subtab.
  - **AI diary prompt:** `buildDayPrompt` (`server/src/lib/diary.ts`)
    also passes the report on to the writing AI — the generated full
    diary texts can thus incorporate the day's agent activity.
  - **Cron trigger:** Triggered by the 03:30 Berlin cron on the Hermes
    host, which delivers the report for the consumption day that just
    ended to the meDiary server (default `date` = `dreamTargetDate(now)`
    = consumption day before). This puts report and dream on exactly
    the same day.
  - **Schema:** New table `daily_reports` in `server/src/db.ts`
    (`date` PRIMARY KEY, `report` NOT NULL, `source`, `created_at`,
    `updated_at`). Idempotent upsert per day (`upsertReport`).
  - **Dream context:** `gatherDreamContext` (`server/src/lib/dreams.ts`)
    pulls the current daily report **and** the 7 most recent reports
    (`reportsBefore`) as two new sections into the dream prompt. This
    lets M3 spot patterns between agent activity (coding marathons,
    deploy stress, cron runs, server issues) and daily wellbeing.
  - **Skip protection:** `hasContent` now counts an existing report —
    a day with an empty medication diary but a filled agent report
    still produces a dream.
  - **API surface (`server/src/routes/report.ts`):**
    - `POST /api/report/new` — body `{ date?: "YYYY-MM-DD", report: string,
      source?: string }`. 200 with serialized record, 400 for
      empty/too-long `report` (>64 KiB) or failed validation.
    - `GET /api/report?from=&to=&limit=` — list (newest first).
    - `GET /api/report/:date` — single report (always 200, `exists:false` if empty).
    - `DELETE /api/report/:date` — delete (204 / 404).
  - **Integration:** `serializeReport` in `lib/serialize.ts`, mounted under
    `/api/report` in `index.ts`.
  - **Auth:** open (private deployment, analogous to the rest of the read
    API; the write cron runs on the same host). If it ever becomes external,
    the hookup point is the same as `POST /api/intakes/text` (Cloudflare
    Access → CF Access fail-closed bypass via `CF_ACCESS_DISABLED`).
  - **Docs:** entry in `AGENTS.md` (architecture point + session change),
    `docs/api.md` (endpoint table) and `docs/architecture.md` (DB schema).

- **2026-06-18 — Daten-Konsole „Chat with your data" (Auftrag `/chat-with-data`)**:
  - **Feature:** New tab `/konsole` — a natural-language data console for
    bulk corrections that are not possible through the normal UI (merge
    substances, backfill/delete intakes, shift time points, correct timezone
    errors, rename within quantities, set night-med flag) — plus free-form
    querying of the data.
  - **Two-phase safety model (`server/src/lib/chat_tools.ts`):**
    - **Reading** runs exclusively over a separate, read-only
      better-sqlite3 connection (`{ readonly: true }` + `query_only`).
      `run_read_query` accepts only a single `SELECT`/`WITH` statement
      (prefix check + `prepare` single-statement + `reader` check +
      ATTACH/PRAGMA block); `inspect_schema` returns the live schema.
      Rows capped at `CHAT_MAX_ROWS` (default 500).
    - **Writing** ONLY via `propose_change_set`: the model returns typed,
      zod-validated operations (no write SQL). The server compiles them
      into parameterized queries, computes a dry-run (affected rows +
      before→after sample) and stores the change set as `proposed`.
  - **Atomic + reversible:** `POST /api/chat/change-sets/:id/apply` runs
    all operations in ONE transaction, stores a pre-state snapshot and
    sets `applied`. `…/undo` restores from the snapshot (only the most
    recently applied change set). Audit log via `chat_change_sets`
    (table in `db.ts`).
  - **Model (`server/src/lib/chat_agent.ts`):** agentic **Anthropic
    messages** tool loop against the Anthropic-compatible MiniMax
    endpoint (`{CHAT_BASE_URL=https://api.minimax.io/anthropic}/v1/messages`,
    `MiniMax-M3`). Agent loop server-side (read tools immediately,
    `propose_change_set` is proposal only), full `content` including
    `thinking` blocks (with `signature`) appended each round, real
    SSE streaming to the UI (with a clean non-stream fallback). Keys
    **server-side only**; default = existing `MINIMAX_API_KEY`,
    `CHAT_API_KEY` takes precedence.
  - **Auth / rate limit:** The mutating endpoints (`message`, `apply`,
    `undo`, `discard`) are — like `POST /api/intakes/text` — protected
    by Cloudflare Access (fail-closed; `CF_ACCESS_DISABLED=true` as local
    bypass) and rate-limited (`CHAT_MIN_INTERVAL_MS`). Read endpoints
    (`status`, `change-sets`) are open.
  - **Frontend:** `web/src/screens/ConsoleScreen.tsx` +
    `components/console/*` — transcript as a command log (monospace
    JetBrains Mono, newly via `@fontsource-variable`), change set card
    with before→after diff in muted semantic diff colors (new `--diff-*`
    tokens, light & dark), confirm/discard, extra confirmation from
    100 rows, undo, audit log sheet. Real empty state with example
    commands. Keyboard: ⏎ send, ⇧⏎ new line, stop.
  - **Verified:** `typecheck:all` clean, web build clean; data-layer
    smoke (23/23: read-only block, preview, apply+undo for
    merge/delete/backfill/shift) and HTTP lifecycle (apply→undo→409,
    CF Access fail-closed) against `/tmp` green.

- **2026-06-17 — Deployment migrated to Docker Compose**:
  - **New production path:** `docker compose up -d --build` builds a
    multi-stage image with server and Vite frontend and starts `mediary`
    with `restart: unless-stopped`.
  - **User data in repo:** Compose mounts `./data` to `/data`; DB,
    `DEFAULTS.md` and `diary.md` live there. On the first container start
    the repository `DEFAULTS.md` is only copied if `/data/DEFAULTS.md`
    is still missing.
  - **Systemd removed:** `deploy.sh`, `mediary.service`, `start.sh`,
    the old `build/` artifact and the systemd-oriented `build.sh` are
    gone; `npm run build` now simply builds web and server.
  - **Docs updated:** README, deployment/development docs, `.env.example`,
    pitfalls and AGENTS point to Docker Compose instead of `npm run deploy`.

- **2026-06-17 — Nightly "dreaming" (MiniMax M3) + dream tab + startup
  dialog + review hardening**:
  - **Feature (assignment `/traum`, phases 1–4):** Every night at
    `DREAM_TIME` (default 04:20 local, DST-safe via local `Date`
    construction in `dream_scheduler.ts`) the server sends
    `system_prompt.md` (system, fresh from disk) + the assembled daily
    context (user) to **MiniMax M3** (OpenAI-compatible,
    `POST {MINIMAX_BASE_URL}/chat/completions`, `Authorization: Bearer`,
    response `choices[0].message.content`, `<think>…</think>` stripped)
    and stores the result as a "dream" per consumption day (`dreams`
    table, PK `date`, idempotent). Target day = **consumption day
    before** (`dreamTargetDate` = `consumptionDay(now) − 1`, analogous
    to habit). Context (`gatherDreamContext` in `lib/dreams.ts`):
    plan (should), actual intakes, off-plan consumption (by `nameKey`),
    wake time, daily notes, 11 scales, **the 7 most recent evaluations**
    (not necessarily 7 calendar days). The "dream" IS the
    matter-of-fact medical evaluation — only the branding/design is
    dreamlike.
  - **Server building blocks:** `lib/minimax.ts` (client, dependency-free
    via `fetch`), `lib/dreams.ts` (`generateDream` with idempotency /
    empty-skip / retries + backoff, `catchUpDreams`, `gatherDreamContext`),
    `lib/dream_scheduler.ts` (in-process timer + `withDreamLock`),
    `routes/dreams.ts` (`GET /api/dreams`, `/latest`, `/:date`,
    `DELETE /:date`, `POST /generate`), CLI `src/dream.ts`
    (`npm --prefix server run dream -- [--date=YYYY-MM-DD] [--force]`).
  - **Frontend:** Subtab "Short" → **"Info"** (label only, raw log
    unchanged), "Full" → **"Dream"** (history of dreams, monthly
    grouping, collapsible long cards); old Anthropic diary-generation
    path in UI retired. Startup dialog (`DreamStartupDialog`) shows
    the most recent dream **once per session** (blur scrim, moonlight
    halo, stars, focus trap/escape, `prefers-reduced-motion` aware).
    Nightly oneiric tokens in `index.css` (`--night-*`, `--moon-halo`,
    `--periwinkle`, `--star`); sage remains the primary interactive
    accent.
  - **MiniMax thinking verified against docs (user requirement):** M3
    accepts for `thinking.type` per platform.minimax.io **only**
    `adaptive` or `disabled` (NO `budget_tokens`); omitting = ON.
    Dedicated `parseMinimaxThinking` function (instead of Anthropic's
    `parseThinking`): default `{ type: 'adaptive' }`,
    `DREAM_THINKING=off` → `{ type: 'disabled' }` (ALWAYS sent
    explicitly, otherwise thinking would stay on despite "off" —
    previous bug).
  - **Review hardening (adversarial multi-lens audit `traum-review`,
    15 confirmed findings, each cross-verified):**
    - **Auth fail-closed:** `POST /api/dreams/generate` is
      **token-primary**. Behind cloudflared / reverse proxy every
      external request comes through 127.0.0.1 — loopback was therefore
      world-open. Now: a valid `X-Dream-Token` (constant-time,
      `timingSafeEqual`) is mandatory; loopback only counts with
      explicit `DREAM_TRUST_LOOPBACK=true` (default false, reads
      `req.socket.remoteAddress`, NOT `req.ip` → immune to a later
      `trust proxy`). Without either → 403, even from localhost. Plus
      a simple rate limit (`DREAM_MIN_INTERVAL_MS`, default 10s → 429).
    - **MiniMax call with hard timeout** (`DREAM_HTTP_TIMEOUT_MS`,
      default 120s, `AbortController` + caller signal): a hung call
      can no longer block the `withDreamLock` guard indefinitely.
    - **Truncation:** empty response with `finish_reason='length'` →
      `MinimaxTruncatedError` (clear "increase DREAM_MAX_TOKENS"
      hint, **not** retryable — saves pointless backoffs).
    - **Startup catch-up** (`catchUpDreams`, `DREAM_CATCHUP_DAYS`,
      default 7): catches up missed days (restart past 04:20) AND
      later-filled "empty" days — idempotent, empty-skip before the
      MiniMax call.
    - **Frontend / design a11y:** Startup dialog buttons as native
      `<button>` (no more `cx`-without-twMerge class collisions,
      focus-ring offset on the night surface instead of `--bg`);
      `DreamProse` bold parser non-greedy (`**…**` with inner `*`
      ok, no raw markers, `---` ignored); `DreamCard` collapsed
      state derived from `long` (no longer sticks after refetch);
      periwinkle icon in the empty state on night chip instead of
      light `surface2` (AA contrast); `dream-ink-soft` 0.62 → 0.74
      (AA in halo area); `ring-1 dream-hairline` →
      `ring-1 ring-[…periwinkle]/20` (no more default blue);
      AppShell route transition `prefers-reduced-motion`-aware.
  - **Verified:** server TS + web TS each exit 0; server build (`tsc`) +
    Vite build each exit 0. Smoke test against `/tmp` scratch DB + mock
    MiniMax: request form (`thinking={type:adaptive}`, `max_tokens=40000`,
    Bearer, system/user messages), `<think>` strip, truncation
    (non-retryable, 4 ms = no backoff), timeout (abort at 1509 ms),
    catch-up + idempotency; HTTP auth: no token 403, wrong token 403,
    correct token 200, `DREAM_TRUST_LOOPBACK=true` without token 200,
    default without token from localhost 403 (fail-closed), rate limit
    429. Live `./data` untouched.
  - **Follow-up for user:** set `MINIMAX_API_KEY` in `.env`; for the
    external / cron trigger also a long `DREAM_TRIGGER_TOKEN` (loopback
    alone is no longer authorized behind the cloudflared tunnel).
    `DREAM_THINKING` stays on `adaptive` (default). `npm run deploy`
    passes all new DREAM_* vars into the systemd unit.

- **2026-06-16 — Values tab: edit daily pictures + visible day attribution**:
  - **Bug / UX gap:** The "Values" tab only showed the 11 scale trend
    charts; an existing daily picture could **not** be edited afterwards,
    and it was not visible anywhere **which consumption day** was being
    queried at the trigger (night medication complete → `nightMed=true`).
  - **Values tab (`web/src/screens/TrendsScreen.tsx`) fully rebuilt:**
    - **"Today" quick access** (`TodayHero`): summarizes the current
      consumption day as a card (date, `n/11 values`, average, note
      preview) and opens the `AssessmentSheet` for exactly this day
      on tap.
    - **"Daily pictures in range" list** (`AssessmentRow`): each
      captured daily picture is a tap element (date, `n/11 · avg X.X`,
      note preview) — tapping opens the `AssessmentSheet` for exactly
      this consumption day, so **past** days can also be backfilled
      / corrected at any time.
    - **"+ New" button:** a compact `DatePickerSheet` (`type="date"`
      + quick select today / yesterday / day before yesterday /
      7 days ago) creates a daily picture for any past consumption
      day (default = today; `max={today}` prevents future selection).
    - **"11 scales — trends" section collapsible** (default
      collapsed) so the daily pictures list is immediately visible.
  - **`AssessmentSheet` (`web/src/components/AssessmentSheet.tsx`)**
    now shows the **consumption day** in the subtitle (`Thursday,
    11 June 2026 · Today` / `… · yesterday` / `… · 3 days ago`) and
    adapts the body text (`isToday` / `date < today` / `date > today`)
    so it is clear **which day** is currently being edited —
    regardless of whether it was opened via the night-medication
    trigger (today), retroactively from history, or from the date
    picker in the values tab. Save toast now also names
    `formatFull(date)` in the detail.
  - **Night-medication trigger: day display was already correct.** The
    server has returned `assessmentDate` (consumption day via
    `consumptionDay`) since the 2026-06-14 fix; the `AssessmentSheet`
    already opens on exactly that day. What was missing was the
    **visible label** in the sheet (see above) — now there.
  - **Verified:**
    - Server TS (`tsc --noEmit`) + web TS each exit 0,
      Server build (`tsc`) + web build (`vite build`) each exit 0.
    - E2E against `/tmp` scratch DB: `GET /api/assessments/2026-06-15`
      returns existing data (`exists:true`), `PUT` with new values
      + note overwrites cleanly (new `updatedAt`), `DELETE` → 204,
      subsequent `GET` → `exists:false` with empty defaults. Night-
      medication trigger (lithium + quetiapine at night): intake at
      22:30 → `assessmentDate: "2026-06-16"` (today); intake at 02:00
      → `assessmentDate: "2026-06-15"` (day before via 03:30
      boundary). Live `./data` untouched.
  - **Follow-up for user:** no config change. The new date picker
    action is just a UI add-on; the server endpoints
    `/api/assessments[/:date]` PUT / DELETE were already present.

- **2026-06-16 — Habit endpoint: PC usage → wake time + day-before hard**:
  - **Goal:** The `first_user_interaction_24h_unix` /
    `last_user_interaction_unix` values reported by the
    `POST /api/habit/uptime` webhook were incorrectly stored as
    "PC usage", the target date hung off the `last` consumption day
    (could be wrong if the cron ran at a different time), and intakes
    did not flow into the calculation at all. New: the values are
    treated as indicators of "awake" and combined with the previous
    day's intake time points; the target date is **always the
    consumption day before** from the webhook's perspective
    (day boundary 03:30 Europe/Berlin, hard `today - 1`).
  - **Algorithm (in `server/src/routes/habit.ts → POST /uptime`):**
    1. `targetDate` = consumption day before (`yesterdayConsumptionDay()`,
       `todayConsumption - 1d`).
    2. Load intakes in the wall-clock range
       `targetT03:30:00 … (target+1)T03:29:59` (i.e. exactly
       `consumptionDay(takenAt) === targetDate`).
    3. `intakeFirstUnix` = latest intake in `[day start 03:30, first)`
       — "intake before first PC interaction".
    4. `intakeLastUnix` = latest intake of the day.
    5. `wake_first_unix` = `intakeFirstUnix` if present, otherwise
       `first_user_interaction_24h_unix`.
    6. `wake_last_unix` = `max(intakeLastUnix, last_user_interaction_unix)`.
  - **Schema migration in `db.ts`** (idempotent, runs at start):
    `ALTER TABLE daily_habits RENAME COLUMN pc_first_interaction_unix TO
    wake_first_unix` (and analogously
    `pc_last_interaction_unix → wake_last_unix`). SQLite ≥ 3.25
    supports this natively; fallback path for older versions (create
    new table, copy data, drop old) is in place. `HabitRow` and
    `serializeHabit` renamed accordingly.
  - **Diary lib (`server/src/lib/diary.ts`):**
    - `DiaryDayHabit` renamed: `pcFirstInteractionUnix` /
      `pcLastInteractionUnix` → `wakeFirstUnix` / `wakeLastUnix`.
    - `gatherDiaryDays()` sets the new field, comment changed from
      "PC value" to "wake time value".
    - `buildDayPrompt()` now writes
      `Habits: wake time HH:MM–HH:MM (≈ X.X h awake).` instead of
      "PC usage … h active". **Important:** the writing AI is
      explicitly pointed out via comment that this is the
      **wake time** (waking up until falling asleep), **not** screen
      time — so the duration is not "spent at the PC".
  - **Frontend (`web/src/lib/types.ts` + `web/src/screens/DiaryScreen.tsx`):**
    Types `DiaryDayHabit` and `Habit` renamed, block in the short
    version now called "Wake time" (with `Sun` icon instead of
    `Monitor`), display `HH:MM – HH:MM · X.X h awake` (instead of
    "active"), fallback strings "first awake …" / "last awake …"
    (instead of "first/last activity").
  - **Verified:**
    - Server TS (`tsc --noEmit`) + web TS each exit 0,
      Server-Build (`tsc`) + Web-Build (`vite build`) je exit 0.
    - E2E gegen `/tmp`-Scratch-DB (`seed.ts` + Einnahmen-Patch auf
      15.06. 07:00..22:15):
      - **Case A** (intakes day before, `first=17:30 < intakeFirst`):
        `wake_first = 08:00 (vitamin D, latest intake before first)`,
        `wake_last = 22:15 (quetiapine, intakeLast > last=22:00)`,
        `date = 2026-06-15 (consumption day before)`. ✓
      - **Case B** (empty day before):
        `wake_first = first`, `wake_last = last`,
        `intakeFirstUnix / intakeLastUnix = null`. ✓
      - **Case C** (one intake AFTER `last`):
        `wake_last = max(intakeLast, last) = intakeLast`. ✓
    - All four 400 paths tested: `first > last`, `last` in the future,
      `first` > 25h before `now`, missing fields (zod). ✓
  - **Follow-up for user:** no config change; the existing cron script
    continues to send the same fields, only the meaning on the server
    has changed. A historical live DB is migrated automatically at the
    next server start.

- **2026-06-15 — Habit / PC uptime endpoint & diary integration**
  (superseded by 2026-06-16 — see above): the original implementation
  counted the incoming values as "PC usage" rather than wake time, the
  target date hung off the `last` consumption day instead of the hard
  day before, and the AI prompt suggested screen time to the writing AI
  instead of wake time.
  - **Goal:** Receive daily PC usage times from the local client (cron
    at 03:30 Europe/Berlin) via HTTP and integrate them into the diary
    (both short and full / AI version).
  - **New table `daily_habits`** in `server/src/db.ts` (idempotent via
    `CREATE TABLE IF NOT EXISTS`):
    - `date TEXT PRIMARY KEY` (consumption day, same 03:30 boundary as
      intakes / daily picture)
    - `pc_first_interaction_unix REAL` (nullable)
    - `pc_last_interaction_unix REAL` (nullable)
    - `created_at`, `updated_at` (local ISO)
  - **New router `routes/habit.ts`** (mounted under `/api/habit` in
    `index.ts`):
    - `POST /api/habit/uptime` — body
      `{"last_user_interaction_unix": <float>, "first_user_interaction_24h_unix": <float>}`.
      Day assignment = consumption day of the `last` timestamp
      (semantically "day that is just ending"). With a real 24-hour
      window around 03:30, `first` can mathematically lie in another
      consumption day (the window spans the day boundary) — that is
      **not an error**, the response includes `crossedBoundary: true`
      for diagnostics. Plausibility checks: `last` ≤ `now+10min`
      (scheduler skew), `first` ≥ `now-25h-10min` (real 24h window +
      slack), `first ≤ last`. The response also includes `firstLocal`
      / `lastLocal` (locally resolved ISO times) and `firstDay` /
      `lastDay` (consumption days) for debugging.
    - `GET /api/habit?from=&to=` — list (YYYY-MM-DD range).
    - `GET /api/habit/:date` — single day; `exists: false` if empty.
    - `DELETE /api/habit/:date` — 204 / 404.
  - **Server helper `time.ts`** extended: `unixToLocalISO`, `nowUnix`,
    `consumptionDayFromUnix` (unix seconds → local ISO / consumption day).
  - **Diary lib (`server/src/lib/diary.ts`)**:
    - `gatherDiaryDays()` also reads `daily_habits`; a day now counts
      as "noteworthy" if it has at least one intake note, a daily
      picture **or** a habit record.
    - `DiaryDay` extended with `habit: { pcFirstInteractionUnix,
      pcLastInteractionUnix }` (re-exposed server-side in
      `DiaryNoteDay`).
    - `buildDayPrompt()` enriches the AI prompt with
      `Habits: PC usage HH:MM–HH:MM (≈ X.X h active).`, so the
      generated full-text entries incorporate PC activity.
  - **API routes & frontend:**
    - `GET /api/diary/notes` now additionally returns `habit` per day.
    - `web/src/lib/types.ts`: `DiaryDayHabit` and `Habit` added.
    - `web/src/lib/api.ts`: `api.habit.{uptime,list,get,remove}` exposed
      (for future UI / smoke tests; primary consumer is the external
      client cron, not the frontend).
    - `web/src/screens/DiaryScreen.tsx` (short tab): PC usage as a
      separate block with monitor icon, analogous to the daily-picture
      block. Display `HH:MM – HH:MM · X.X h active` (or "last/first
      activity HH:MM" if only one value is present).
  - **Verified:** `npx tsc --noEmit` for `server/` and `web/`
    (in `/tmp` sandbox with `npm install`) → exit 0. Smoke test against
    a local server (`DB_PATH=/tmp/...`, `PORT=4321`): POST stores under
    the correct consumption day, GET returns list with correctly
    serialized values, GET `/api/diary/notes` contains the `habit`
    field, all validation tests (`first>last`, `first>25h`, negative,
    NaN, missing) return 400 with a clear error message.
    `buildDayPrompt()` contains the new `Habits:` line with locally
    resolved HH:MM + hour difference.
  - **Open items / next steps:**
    - Client script (cron job that measures `last` and `first` and
      POSTs) lives outside this repo.
    - No auth protection: `POST /api/habit/uptime` is open. If the
      API does not run behind Cloudflare Access / a VPN, a token
      header or similar should be added (see `intakes/text` as the
      model).
    - Currently only PC uptime; the schema is generic enough to add
      further habit fields later (e.g. sleep times, screen time) —
      the column names are explicitly `pc_…` and an extension would
      require a schema migration.

- **Free-text parser made more robust: date/time forms, "Uhr" suffix,
  amount / note separation**:
  - **Goal:** `POST /api/intakes/text` should reliably recognize date,
    time, substance name, amount (before OR after the name) and note.
    "200 mg Pregabalin" previously sometimes returned just an error;
    many time / note forms were missing.
  - **Time prefix (`parsePrefix` in `server/src/lib/text_entries.ts`)**
    now additionally recognizes: **`Uhr` suffix** (`20 Uhr`, `8 Uhr`,
    `8:30 Uhr`, `8.30 Uhr` — dotted number before `Uhr` is time, not
    date), **hour-only** (`20 Uhr` → 20:00), optional **`um`**
    (`um 20 Uhr`), **relative days** (`heute` / `gestern` /
    `vorgestern` / `morgen` / `übermorgen`, alone or with time).
    An affirming **time-of-day word after the time** (`21 Uhr nachts:`,
    `8:30 morgens:`) is discarded as a prefix residue instead of
    becoming a note.
  - **Amount detection**: measurement units and **dosage / count words**
    (`Tablette(n)`, `Tropfen`, `Hub`, `Sprühstöße`, `TL`, `Kapsel`, …)
    after a number count as amount; **Unicode fractions glued to
    unit** (`½mg`, `¼g`), **ranges** (`1-2 Tabletten`) and bare leading
    numbers (`300 Baldrian`) are recognized. A dose after a
    **descriptor** (`Lithium retard 450 mg`, `Pregabalin morgens 150 mg`,
    `Magnesium Citrat 300mg`) is correctly extracted as amount, the
    descriptor becomes note (instead of swallowing the amount).
  - **Note**: bracket note AND free note (before / after the name) are
    both preserved (`Lorazepam 1mg bei Panik (sublingual)` → note
    "bei Panik sublingual"). Trailing adverbial note words
    (`morgens`, `abends`, `nüchtern`, …) are also separated from the
    name for still **unknown** substances without anchor
    (`peelTrailingNoteWords`).
  - **Multiple entries**: `splitEntries` receives `knownKeys` —
    " und " only splits real entries (leading amount OR known name OR
    amount-anywhere, also catches unknown "amount-after" entries
    like "Hustensaft 10 ml"); if "und" is inside a free note
    (`Lithium 600 mg morgens und abends`), it stays ONE entry.
    Separator artifacts (leading / trailing / double "und") and pure
    punctuation segments (`.` / `...` / `300mg und`) are cleaned up or
    reported as errors, instead of creating ghost substances.
  - **Verification**: server / web TS + server build each exit 0; an
    adversarial multi-agent audit (8 lenses) confirmed 25 misparsings —
    **all fixed** and cross-verified. E2E against `/tmp` scratch DB
    (CF bypass): dryRun + real write with DB verification
    (`verified:true`), including "200 mg Pregabalin" →
    Pregabalin / 200 mg, "Uhr" forms, "Lithium retard 450 mg",
    "½ Tablette", "Pregabalin morgens 150 mg" (unknown) →
    name / amount / note correct; "300mg"-only → isolated line error;
    live `./data` untouched. Response schema / `dryRun` /
    companion substances unchanged; the parser stays DB-free
    (`knownKeys` passed by the route).

- **Free-text import: amount BEFORE the substance name + known name as split**:
  - **Problem:** `POST /api/intakes/text` only read the `Substance
    Amount` format. With "amount first" the amount wrongly landed in
    the name ("100mg Pregabalin" → substance "100mg Pregabalin") and
    "200 mg Lorazepam" failed entirely (leading bare number → error
    "substance name missing").
  - **Fix in parser `server/src/lib/text_entries.ts`**
    (`parseSingleEntry`, now with `knownKeys` parameter):
    1. **Known substance name as anchor** (user request): if the entry
       contains an already-known substance name (`knownKeys`,
       normalized via `nameKey`, longest matching token sequence), it
       splits amount from note — amount before ("100mg Pregabalin")
       OR after ("Pregabalin 100mg"), free note after without
       brackets ("Pregabalin nüchtern", "150mg Pregabalin morgens").
       Amount-led spans ("100mg Pregabalin") are skipped during
       matching so that any pre-existing legacy substance
       "100mg Pregabalin" does NOT win.
    2. **Amount-first (fallback without known name):** if the entry
       starts with an amount WITH unit ("100mg …", "200 mg …",
       "0,5 ml …"), it counts as amount, the rest as (new)
       substance name. The unit is required — so "5 HTP 100mg" →
       substance "5 HTP" + amount "100 mg" (number belongs to the
       name).
    3. **Substance-first (standard, unchanged):** "Elvanse 30mg",
       "Omega 3 500 mg"; a leading unitless number ("300 Baldrian")
       counts as amount.
    - Pure amounts without name ("300mg", "200 mg", "0,5") stay a
      line error (central `finalize` guard via `isQuantityRun`).
  - **`nameKey` extracted into `server/src/lib/names.ts`**
    (dependency-free): `substances.ts` re-exports it (existing code
    unchanged), `db.ts` uses it instead of its local copy, and the
    parser stays DB-free. The `POST /api/intakes/text` route builds
    the set of known names (active + archived) and passes them to
    `parseFreeText(text, undefined, knownKeys)`. Response schema /
    `dryRun` / companion substances unchanged.
  - **Side note (outside the assignment):** `server/src/config.ts`
    used `__dirname` in `dotenv.config(...)` BEFORE its declaration
    (broken uncommitted state → TS error + runtime `ReferenceError`,
    blocked the entire server build). Call order minimally fixed
    (declaration first), intent (load `.env` from repo root)
    unchanged.
  - Verified: server TS + server build each exit 0; E2E against
    `/tmp` scratch DB (CF bypass): user examples "100mg / 200mg
    Pregabalin", "200 mg Lorazepam" → correctly split, 3/3 verified,
    amounts normalized; known name in both orders + note-after;
    legacy "100mg Pregabalin" substance ignored;
    "5 HTP 100mg" / "300 Baldrian" / "Omega 3 500 mg" / "0,5 ml
    CBD-Öl"; companion substance theanine → lemon balm still ok;
    "300mg" / "200 mg" / "0,5" → error.

- **Day boundary 03:30 Europe/Berlin in frontend + date stays after submit**:
  - **Server `consumptionDay()` as the truth for `intake.date`** —
    `serializeIntake` (`server/src/lib/serialize.ts`) now computes
    `date` via `consumptionDay(taken_at)` (DAY_BOUNDARY) instead of
    `slice(0, 10)`. Intakes 00:00–03:29 thus have a `date` shifted
    back by one day.
  - **Server `allNightMedsTaken(day)` fixed** (`server/src/db.ts`):
    the DB query now uses the wall-clock range
    `dayT03:30:00` … `(day+1)T03:29:59` — i.e. exactly the intakes
    whose `consumptionDay(takenAt) === day`. Previously it queried
    `dayT00:00:00` … `dayT23:59:59`, which did not cover the 03:30
    boundary behavior (an intake at 02:30 belongs to the day
    before for consumption purposes but was not caught by the
    search range). Consequence: the daily picture is now triggered
    reliably when the last night-med intake occurred before 03:30.
  - **Frontend `web/src/lib/time.ts`** (new) mirrors the server
    helper: `DAY_BOUNDARY`, `consumptionDay`, `consumptionToday`,
    `consumptionTodayOffset(n)`, `nowLocalInput`, `parseLocal`,
    `toDateString`. `format.ts` re-exports these helpers, so old
    callers of `todayStr` / `nowLocalInput` / `parseLocal` /
    `dateNDaysAgo` from `format.ts` keep working.
  - **`formatDayLabel` / `relativeDays` use `consumptionToday()`**
    instead of `todayStr()` — an intake at 02:30 appears in the
    history list as "Yesterday" (consumption day), not "Today"
    (wall-clock day).
  - **QuickEntryScreen (`today = consumptionToday()`)** plus
    local filter `it.date === today` from the last 2 consumption
    days. Robust against the SQL `from/to` heuristic (which still
    works on wall-clock time).
  - **Composer `takenAt` stays after submit** — `resetComposer()`
    only resets `selectedId` / `amount` / `note`, no longer
    `takenAt`. Initial `useState(nowLocalInput())` on mount,
    "Now" button resets it explicitly. This lets multiple
    substances of one block ("morning meds" or nighttime) be
    captured without setting the clock again.
  - Verified: server TS, web TS, server build (`tsc`), Vite build
    each exit 0; E2E against `/tmp` scratch DB: `02:30` →
    date = day before, `03:29` → day before, `03:30` → current
    day, `03:31` → current day; plan batch `night @ 22:00`
    (consumption day = same day) and `night @ 02:30`
    (consumption day = day before) trigger the daily picture for
    the respective correct consumption day; PATCH with
    `takenAt=01:00` also sets `date` to day before. Live `./data`
    untouched.

- **Documentation: multi-line text input API explained**:
  - No code / schema change. The existing route `POST /api/intakes/text`
    was checked against implementation and `SAMPLES.md` and this file
    was extended with a short usage reference including `curl` examples
    for JSON, `dryRun`, `companions: false`, `text/plain` and
    Cloudflare Access hints.
- **Free-text import (`/text`): `Mit:` companion substances + amount/note omission**:
  - `POST /api/intakes/text` now captures — like `POST /` — the
    `Mit:` companion substances from DEFAULTS.md automatically with
    each entry (e.g. theanine → lemon balm "100 mg" + `Mit:` note).
    Same time point as the main entry, one level deep, self-reference
    skipped, `source_event_id = companion:<main-id>`. Previously they
    were deliberately excluded here — this decision has been reversed
    on request. `companions: false` in the JSON body disables it
    per call.
  - **Amount and/or note may be omitted in the text** → the
    DEFAULTS.md values apply (already the case: text amount >
    default dose > DEFAULTS; text note > DEFAULTS note). Now
    verified.
  - **Verification also covers companion entries**: the endpoint
    re-reads ALL IDs (main + companion) fresh from the DB after
    commit. Response `entries[]` get a nested
    `companions: { createdSubstance, verified, intake }[]`;
    `created` counts all verified entries (main + companion),
    `requested` still only main entries, `verified` (total) true
    iff every planned insert was found. `dryRun` shows a read-only
    companion preview (`previewCompanions` in `routes/intakes.ts`,
    no substance creation).
  - Verified: server TS + server build each exit 0; E2E against
    `/tmp` scratch DB: dryRun preview theanine → lemon balm
    (100 mg + `Mit:` note); real run "jetzt: Theanin" →
    theanine 400 mg (DEFAULTS, amount omitted) + lemon balm
    `companion:<id>`, both `verified`, `created:2 requested:1`;
    multi-line (companion attaches only to theanine, not to
    Elvanse / lithium) with atomic error line; `companions:false`
    → no lemon balm; live `./data` untouched.
- **Free-text import `POST /api/intakes/text` + Cloudflare Access protection**:
  - **Parser `server/src/lib/text_entries.ts`** (`parseFreeText`):
    multi-line free text per SAMPLES.md → entries. Per line optional
    prefix `DD.MM(.YYYY) HH:MM:` / `HH:MM:` / `jetzt:` / none
    (= now; without year = current year, without date = today; only
    date = current time on that day); entries
    `Substance Amount (Note)` separated by commas / " und " at
    bracket depth 0 (decimal commas `0,5` do not split). Amount =
    first number token after the name; for number sequences
    ("Omega 3 500 mg") the last wins; pure amounts without a name
    ("300mg") are errors. Calendar-true date / time validation
    (31.02. / 25:99 → line error). One line is
    atomic: one unparsable entry → the whole line in `lineErrors`, the
    remaining lines continue (safe re-sending of corrected lines).
  - **Route `POST /api/intakes/text`** (`server/src/routes/intakes.ts`):
    body JSON `{ text, dryRun?, companions? }` or `text/plain`.
    Resolution per entry like `POST /` (text amount > default dose >
    DEFAULTS; text note > DEFAULTS note — **amount / note may be
    omitted, then DEFAULTS apply**), autovivification included.
    **`Mit:` companion substances are captured automatically per
    entry** (as with `POST /`; e.g. theanine → lemon balm), one
    level deep, self-reference skipped, `source_event_id =
    companion:<main-id>`; `companions: false` disables this. Main
    entries in one transaction, `source_event_id = text:<timestamp>`
    as a batch marker. **Verification: after the commit, the endpoint
    re-reads all IDs (main + companion) fresh from the DB** and
    responds with `verified` per entry, per companion entry and total
    (`{ batchId, lineCount, requested, created, verified, entries: {
    …, companions[] }[], lineErrors[] }`; `requested` = main entries,
    `created` = all verified). `dryRun` only parses (including a
    read-only companion preview `previewCompanions`). 400 if nothing
    is parseable.
  - **Cloudflare Access (`server/src/lib/cloudflare_access.ts`)**:
    middleware `requireCloudflareAccess` validates the JWT handed by
    Cloudflare to the origin (`Cf-Access-Jwt-Assertion` header,
    alternatively `CF_Authorization` cookie) entirely in `node:crypto`
    (no new dependency): RS256 signature against the team JWKS
    (`<team>/cdn-cgi/access/certs`, 10-minute cache, fresh fetch on
    unknown kid for key rotation), `aud` = AUD tag, `iss` = team
    domain, `exp` / `nbf` with 30s tolerance. Service tokens
    (CF Access client ID / secret) are checked by Cloudflare at the
    edge — at the origin a JWT also arrives for them. Fail-closed:
    without `CF_ACCESS_TEAM_DOMAIN`+`CF_ACCESS_AUD` → 503;
    `CF_ACCESS_DISABLED=true` = explicit dev bypass. New env
    variables see table (server configuration). No UI part — the
    endpoint is intended for external automations (Telegram bot,
    Shortcuts, …).
  - Verified: server / web TS, server build, Vite build each exit 0;
    E2E against `/tmp` scratch DB (dryRun without writing; 7/7
    entries created + verified incl. DEFAULTS amount theanine,
    DEFAULTS note CBD, `30mg`→`30 mg`, decimal comma, "Omega 3
    500 mg" heuristic, 3 error lines; no lemon balm companion;
    text/plain body; 400 on error-only text; 503 without CF config;
    401 without token / garbage token / manipulated signature /
    wrong audience / expired; 201 with valid JWT via header and via
    cookie against local test JWKS).
- **Batch entries "morning meds" / "night meds"**:
  - New endpoint `POST /api/intakes/plan-batch`
    (`server/src/routes/intakes.ts`): with one call records all
    substances of the plan effective at `takenAt` that have a dose
    in the requested slot (`morning` / `noon` / `evening` / `night`)
    — in one transaction, same time point. Amount / note per
    substance like `POST /` (default dose > DEFAULTS > plan
    `strength`; note from DEFAULTS). Autovivification per plan
    substance (`createdSubstance` flag per entry), `source_event_id
    = planbatch:<slot>`. **No** `Mit:` companion substances (the
    plan is the authoritative list, otherwise duplicates). Dedup
    of same names within a slot via `nameKey`. After recording,
    `allNightMedsTaken(consumptionDay(takenAt))` → `nightMed` /
    `assessmentDate` trigger the daily picture (so after "night
    meds" the query dialog opens). Response: `{ slot, count,
    entries: { intake, createdSubstance }[], nightMed,
    assessmentDate, assessmentExists }`.
  - **Frontend (`web/src/screens/QuickEntryScreen.tsx`):** two batch
    tiles `PlanBatchTile` ("morning meds" / "night meds") at the
    start of the substance grid — only visible if the current plan
    (`usePlan()`) has any substances for the slot (`morningCount` /
    `nightCount`). One tap is an immediate action (no selection /
    confirmation bar): records everything at the composer
    `takenAt`, toast with substance list + "Undo" (deletes all
    generated intakes). After "night meds", `nightMed &&
    !assessmentExists` opens the daily picture. New mutation
    `useIntakeMutations().planBatch` (invalidates `substances` /
    compliance when a plan substance was newly created); API client
    `api.intakes.planBatch`; types `PlanSlot` / `PlanBatchEntry` /
    `PlanBatchResult` (`lib/types.ts`).
- **Amount normalization: number + letter gets a space**:
  - `normalizeAmount()` automatically inserts a space between digit
    and letter (`100ml` → `100 ml`, `50mg` → `50 mg`).
  - Takes effect everywhere `amount` is created: `POST /api/intakes`,
    `PATCH /api/intakes/:id`, `POST /api/substances`,
    `PATCH /api/substances/:id`, DEFAULTS.md parser (`Menge:` +
    `Mit:`), companion substances.
  - Regex: `(\d)([a-zA-ZäöüÄÖÜßµ])` → `$1 $2` — covers mg, ml, µg etc.
- **Tile order in the "Today" tab sortable**:
  - The backend was already fully in place (`sort_order` column,
    `POST /api/substances/reorder`, `ORDER BY sort_order, name`, API
    client `api.substances.reorder`, `useSubstanceMutations().reorder`)
    — only the operating UI was missing.
  - **Frontend (`web/src/screens/QuickEntryScreen.tsx`):** new
    "Sort" mode (toggle next to "Manage", from 2 substances). In the
    mode the tile grid is replaced by a vertical drag list
    (framer-motion `Reorder` + `useDragControls`, drag-handle `GripVertical`) —
    deliberately a 1D list instead of 2D grid drag, to avoid conflicts
    with the tap / long-press gesture of the tiles. New order is
    debounced (500 ms) and saved automatically via `reorder.mutate(ids)`;
    "Done" and a `useEffect` cleanup on exit flush any pending save.
    Refetch happens server-side via `ORDER BY sort_order` (no client
    state needed).
- **Companion substances via DEFAULTS `Mit:`**:
  - New DEFAULTS line `Mit: <Name> | <Amount> | <Note>` (aliases
    `Zusammen mit:` / `With:`; amount / note optional, multiple lines
    allowed). Parser: `CompanionDefault[]` as new `companions` field
    in `SubstanceDefault` (`lib/defaults.ts`).
  - `POST /api/intakes` creates companion intakes in the same step
    (transaction): same `taken_at`, autovivification, fallback to
    default dose / companion substance's own DEFAULTS,
    `source_event_id = companion:<main-id>`. No chains / cycles (one
    level, self-reference skipped). `companions: false` in the
    request disables it (backfill). Response: new field
    `companions: { intake, createdSubstance }[]`; `nightMed` is
    true even if only the companion substance is night medication
    (daily picture trigger).
  - Importer, XLSX import and `PATCH /api/intakes/:id` remain
    untouched.
  - **Frontend:** composer preview "Automatically also: …" for
    substances with `Mit:` defaults; toast names companion entries
    (`+ Name`) and "Undo" deletes main + companion intakes;
    `useIntakeMutations().create` invalidates `substances` /
    compliance when a companion substance was newly created. Help
    text + placeholder in the DEFAULTS editor extended.
- **`effective_from` with optional time**:
  - `effective_from` now also accepts `YYYY-MM-DDTHH:mm`; plain date
    continues to count from start of day (no migration needed, string
    comparison orders both formats correctly).
  - `planVersionAt(at)` compares to the exact moment: `null` = "now",
    plain date = end of the cutoff day. `upcomingPlanVersions()` and
    the `upcoming` flag in `/api/plan/versions` compare against the
    current time instead of just the day.
  - `PUT /api/plan` validates `effectiveFrom` as date or datetime;
    `GET /api/plan/at?date=` also accepts `YYYY-MM-DDTHH:mm`.
  - **Frontend (`PlanScreen.tsx`):** optional time field next to
    "Effective from" (empty = start of day); hint text calculates to
    the minute (retroactive / today at HH:MM / scheduled). New
    helpers `formatEffective()` and `effectiveTimeOf()` in
    `lib/format.ts`; `relativeDays()` tolerates datetime strings.
    Time display in header, "Scheduled change", version history
    and snapshot sheet.
- **Retroactive / future plan changes**:
  - New column `plan_versions.effective_from` (effective date,
    YYYY-MM-DD) with idempotent migration + backfill from `created_at`
    in `db.ts`.
  - `planVersionAt()` now resolves via the effective date; "current
    plan" = the version effective today (future versions do not yet
    count).
  - `PUT /api/plan` accepts optional `effectiveFrom` (past or
    future); `GET /api/plan` additionally returns `upcoming[]`;
    `GET /api/plan/versions` sorts by effective date and returns
    `effectiveFrom` / `active` / `upcoming` (field `date` =
    effective date).
  - Seed and importer set `effective_from = day of created_at`.
  - **Frontend (`PlanScreen.tsx`):** "Effective from" date field in
    the plan editor with hint text (retroactive / today / scheduled);
    "Scheduled change" card above the plan; version history shows
    "effective from" + badges "current" / "scheduled"; `SnapshotSheet`
    now loads directly via `GET /api/plan/version/:id` (instead of
    the cutoff-day detour). `relativeDays()` additionally knows
    "tomorrow".
- **Automatic substance quick picks + DEFAULTS compliance**:
  - `POST /api/intakes` creates unknown names as quick picks
    (`findOrCreateSubstance`, `createdSubstance` flag in the
    response).
  - `backfillSubstancesFromIntakes()` runs at server start and after
    `import.ts --commit` — links intakes without `substance_id` to
    existing / newly created substances.
  - Unicode-aware matching via `nameKey()` (`toLocaleLowerCase('de')`)
    — important for German umlauts (`CBD-Öl` ↔ `cbd-öl`).
  - `GET /api/defaults/check` returns the full compliance report
    (`compliant` + `missing`).
  - **Frontend:** warning card on the today screen + warning icon on
    affected tiles; new section "Check: DEFAULTS.md" in settings with
    "Entry" quick add into the DEFAULTS editor.

- **2026-06-14 — AI diary via MiniMax subscription instead of Anthropic key + adaptive thinking + max tokens**:
  - **Goal (user request):** The AI diary generation should be able to
    use the **MiniMax subscription** instead of an Anthropic API key.
    MiniMax provides an **Anthropic-compatible** endpoint
    (`ANTHROPIC_BASE_URL=https://api.minimax.io/anthropic`, normal API
    key, **no OAuth**), the wire format is identical — so no new client
    needed. Additionally: **`thinking: { type: 'adaptive' }`** for
    generation and **as many output tokens as possible**.
  - **`server/src/lib/anthropic.ts` (`generateText`)**: now sends the
    `thinking` field (from `config.anthropic.thinking`, default
    `{ type: 'adaptive' }`) and uses `config.anthropic.maxTokens` as
    the `max_tokens` default (instead of the previous hard cap). Any
    `thinking` blocks in the response continue to be ignored (only
    `text` blocks flow into the diary text). New, clearer error
    message when `stop_reason: "max_tokens"` triggers, **before** any
    text arrived ("increase DIARY_MAX_TOKENS"). Still `x-api-key`
    (no `Authorization` Bearer) + `anthropic-version` — works for
    both Anthropic AND MiniMax. Stale comment ("thinking removed")
    corrected: adaptive thinking is valid on Opus 4.6+ / Sonnet 4.6
    (only `budget_tokens` + sampling parameters return 400) AND on
    MiniMax.
  - **`server/src/config.ts`**: two new fields under `config.anthropic`
    — `maxTokens` (`DIARY_MAX_TOKENS`, default **32000**) and
    `thinking` (`DIARY_THINKING` via new `parseThinking()`: empty /
    `adaptive` / `on` / `true` → `{ type:'adaptive' }`; `off` /
    `none` / `disabled` / `false` / `0` / `no` → omitted; positive
    number → `{ type:'enabled', budget_tokens:N }` for older
    models). `ANTHROPIC_BASE_URL` / `DIARY_MODEL` were already
    present.
  - **`server/src/lib/diary.ts`**: the hard `maxTokens: 700` cap on
    the `generateText` call is gone → the configured (high) default
    takes effect, so adaptive thinking has enough room without
    cutting off the short text.
  - **`.env.example` / `deploy.sh` / `AGENTS.md`**: MiniMax block +
    `DIARY_THINKING` + `DIARY_MAX_TOKENS` documented; `deploy.sh`
    passes both new vars into the systemd unit (order after
    `DIARY_MODEL`); env table extended.
  - **No UI / schema change**: route `/api/diary/generate`, response
    and 503 behavior without key remain unchanged. For MiniMax the
    user sets in `.env`:
    `ANTHROPIC_BASE_URL=https://api.minimax.io/anthropic`,
    `ANTHROPIC_API_KEY=<MiniMax key>`, `DIARY_MODEL=MiniMax-M2`
    (model name of choice). `DIARY_THINKING` / `DIARY_MAX_TOKENS`
    are optional (defaults as above).
  - **Verified:** server TS (`tsc --noEmit`) exit 0; E2E against an
    in-process mock in the Anthropic wire format (5 scenarios, each
    against the real `generateText`): (A) MiniMax default →
    `POST /v1/messages`, `thinking:{type:adaptive}`,
    `max_tokens:32000`, model `MiniMax-M2`, `x-api-key` set /
    **no** `Authorization`, `anthropic-version` set, response
    `thinking` block discarded → only text taken over; (B)
    `DIARY_MAX_TOKENS=64000` takes effect; (C) `DIARY_THINKING=off`
    → `thinking` field missing; (D) `DIARY_THINKING=8000` →
    `{type:enabled,budget_tokens:8000}`; (E) without key →
    `AnthropicNotConfiguredError` (503 path), **no** HTTP request.

- **2026-06-14 — Frontend auto-detect, AI diary tab, multi-entry**:
  - **(1) `deploy.sh` / frontend always reachable (belt + suspenders):**
    - `server/src/config.ts → webDist`: without the `WEB_DIST` env, a
      `web/dist` lying next to the build (`SERVER_ROOT/web/dist`) is
      **automatically detected** and served. The build layout
      (`build.sh`) puts the frontend exactly there
      (`~/mediary/web/dist`), so `GET /` works after `npm run deploy`
      even without env. In dev mode (`SERVER_ROOT = server/`) the
      path does not exist → API runs solo, Vite serves :5173.
    - `deploy.sh`: if `WEB_DIST` is missing in `.env`, **default
      `./web/dist`** is injected (previously: no env → no frontend →
      "Cannot GET /"). Additionally `DIARY_PATH` /
      `ANTHROPIC_API_KEY` / `ANTHROPIC_BASE_URL` / `DIARY_MODEL` are
      passed from `.env` into the service unit.
    - Verified: build layout in `/tmp/inst` (dist + web/dist, **no**
      WEB_DIST env) → `GET /` 200 (index.html), `/api/health` 200,
      asset 200, log "Serving frontend from …/web/dist";
      `deploy.sh` injection isolated →
      `Environment="WEB_DIST=./web/dist"` lands in the unit, marker
      replaced.
  - **(2) AI diary as new tab** (`/tagebuch`):
    - Short version (`GET /api/diary/notes`): pure list of notes per
      consumption day (intake notes + daily picture values / note),
      read-only, never changes the DB. Full version: one AI flowing
      text per day, kept in a separate `.md` (`config.diaryPath`,
      default `~/.local/share/mediary/diary.md`) — the DB notes
      remain untouched.
    - **Anthropic connection dependency-free via `fetch`** (`server/src/
      lib/anthropic.ts`, as CF Access uses node:crypto):
      `POST {baseUrl}/v1/messages`, header `x-api-key` /
      `anthropic-version: 2023-06-01`, model `config.anthropic.model`
      (default `claude-opus-4-8`, overridable via `DIARY_MODEL`),
      no `temperature` / `thinking` (removed on Opus 4.8). `refusal`
      stop reason is caught. Without key → 503 (fail-soft, short
      version & display keep working).
    - `server/src/lib/diary.ts`: `gatherDiaryDays` (per consumption
      day with `consumptionDay`), `.md` parser / assembler via
      `<!-- meDiary:day DATE -->` markers (manual edits preserved;
      `scope:'missing'` only fills missing days, `scope:'all'`
      regenerates, `max` caps per call → `pendingDays`). Route
      `server/src/routes/diary.ts`, mounted in `index.ts`.
    - Frontend: new tab "Diary" (`BottomNav` / `App.tsx`),
      `web/src/screens/DiaryScreen.tsx` with short / full toggle,
      generate / "regenerate all" / edit actions, status badges;
      hooks `useDiaryNotes` / `useDiary` / `useGenerateDiary` /
      `useSaveDiary`, API client `api.diary.*`, types `Diary*`.
    - Verified (mock Anthropic, `/tmp` DB): short version lists
      notes + scores; `generate` (missing) produced 6 entries +
      wrote 6 `meDiary:day` markers; again → 0 new; `PUT`
      round-trip; **503 without key**, notes without key still 200.
  - **(3) Several substances recorded at once** (`POST /api/intakes/batch`):
    - Body `{ takenAt?, companions?, entries: [{ substanceId? |
      substanceName?, amount?, notes? }] }` — one shared time point,
      per entry own amount / note, one transaction. Same resolution
      as `POST /` (amount: text > default dose > DEFAULTS; note:
      text > DEFAULTS; autovivification; `Mit:` companion substances
      per entry — switchable off with `companions: false`). Then
      `allNightMedsTaken` → `nightMed` / `assessmentDate`. The
      companion insert was factored into the helper
      `insertCompanions` and shared with `POST /` (identical
      behavior).
    - Frontend `QuickEntryScreen`: single select → **multi-select**
      (`selectedIds[]`). Multiple tapped substances appear in the
      composer as one row each with amount + note (incl. DEFAULTS /
      companion preview), date / time only once. Floating bar
      "X substances · Record" → `useIntakeMutations().batch`;
      long-press on a tile remains the immediate entry with
      defaults. Types `IntakeBatch*`, `api.intakes.batch`.
    - Verified (`/tmp` DB): 3 substances in one call (shared
      `takenAt`, per entry own amount / note, new substance
      autovivified + companion lemon balm), `companions:false`
      suppresses companion entry, invalid `substanceId` / empty
      `entries` → 400.
  - **Subsequent review hardening** (adversarial multi-agent audit,
    each cross-verified): (a) `generateDiary` ALWAYS starts from the
    existing entries — `scope:'all'` with `from/to` previously
    deleted entries outside the range (loss of manual edits); `'all'`
    now regenerates up to the hard cap. (b) `POST /api/intakes/batch`
    checks all `substanceId` in a pre-pass BEFORE new substances are
    created by name (otherwise a leftover on 400 because of a later
    invalid ID). (c) `deploy.sh` masks secrets (`*API_KEY* /
    *SECRET* / *TOKEN*`) when logging and trims `.env` values via
    bash parameter expansion instead of `xargs` (quote / backslash
    safe, no abort under `set -e`). (d) `writeDiaryRaw` creates the
    parent directory (`mkdir -p`). (e) Frontend: batch entry builds
    from `selectedSubs` (no dead IDs), diary editor loads the draft
    only when opening (no overwrite by refetch), "Full" tab shows a
    card on load / offline error instead of empty.
  - **Verification overall:** server TS + web TS each exit 0, server
    build (`tsc`) + Vite build each exit 0; E2E against `/tmp`
    scratch DB (batch incl.
    companions / 400s / `companions:false`; diary short / generate (mock) /
    regen / PUT / 503; `scope:'all'` data preservation; batch leak
    protection; diary mkdir; frontend auto-detect serving); live
    `./data` untouched.

- **2026-06-14 — `deploy.sh` env injection fixed (more robust marker)**:
  - **Bug:** `deploy.sh` only injected WEB_DIST (and other env vars
    from `.env`) into the systemd service unit if the old `awk`
    regex `^# Environment="WEB_DIST=/custom/path/web/dist"$` matched
    **exactly** the (commented-out) example line in `mediary.service`.
    As soon as someone edited the service template, rephrased the
    comment, or simply had no `/custom/path/web/dist` example line
    any more (typical after `git pull` or after the hotfix state
    `2c318cb9` which had structured the service block differently),
    `deploy.sh` fell **fail-silent** into the `else` branch and
    copied the service file unchanged — the user only noticed in
    the browser with `Cannot GET /` that the frontend was missing.
    This is exactly what happened on the running VPS: the installed
    unit under `~/.config/systemd/user/mediary.service` had **no**
    `Environment="WEB_DIST=..."`, `GET /` → 404, even though the
    build `~/mediary/web/dist/` was correctly present.
  - **Fix `mediary.service`:** the commented example block replaced
    with a **unique marker line** `__MEDIARY_INJECT_ENV_HERE__`.
    deploy.sh matches this single line instead of an example path.
    Marker drift (0 or >1 occurrences) leads to `exit 1` with a
    clear error message — no more silent "Cannot GET /".
  - **Fix `deploy.sh`:** marker logic switched from `awk` regex to
    `awk` with `$0 == "# __MEDIARY_INJECT_ENV_HERE__"` match
    (newline-faithful, immune to template drift). Order of injected
    vars: WEB_DIST first, then PORT / DB_PATH / DEFAULTS_PATH /
    CF_ACCESS_*. No more `else` fail-silent: with missing `.env`
    the service file is copied cleanly without the marker (with an
    explanatory comment); with `.env` present the marker line must
    occur **exactly once** — otherwise exit 1. Additional sanity
    check: after writing, the script checks that
    `Environment="WEB_DIST=…"` (if set in `.env`) actually appears
    in the resulting service unit, and fails otherwise with a clear
    message.
  - **Hot fix on running system:** `~/.config/systemd/user/mediary.service`
    manually augmented once with `Environment="WEB_DIST=./web/dist"`,
    `systemctl --user daemon-reload && systemctl --user restart mediary`.
    **Verified:** `GET /` → 200 (`<!doctype html>` from
    `~/mediary/web/dist/index.html`), `GET /api/health` → 200,
    `GET /favicon.svg` → 200, `GET /api/intakes` → 200, SPA fallback
    works. Server log: `[mediary] Serving frontend from
    /home/ubuntu/mediary/web/dist`.
  - **Follow-up for user:** with the next `npm run deploy` the new
    marker path kicks in automatically — keep `.env` with
    `WEB_DIST=./web/dist` (or absolute), the rest runs itself.

- **2026-06-14 — Merge conflict resolved** (task `0a55cd9d`):
  - **Bug:** `b409d7a` (merge `cd/task/2c318cb9` + `cd/task/448cd00a`)
    was committed with unresolved conflict markers:
    - `server/src/config.ts`: `<<<<<<< HEAD` / `=======` /
      `>>>>>>> 06ee54f…` between old `dotenv.config({ path:
      '../../.env' })` + `SERVER_ROOT = __dirname/..` and the new
      `findServerRoot()` variant. Consequence: `tsc` aborted with
      **TS1185 "Merge conflict marker encountered"**, server build
      completely blocked.
    - `AGENTS.md`: same pattern in the "Recent changes (newest
      first)" section — HEAD block (free-text parser improvements
      from PR #1 successor) vs. `06ee54f` block (day boundary 03:30
      / composer reset from PR #2).
  - **Resolution `config.ts`:** took the `06ee54f` side (with
    `dotenv.config()` without explicit path, `findServerRoot()`,
    `resolveFromRoot` resolves against `process.cwd()`). This
    variant is consistent with the code below the conflict area and
    matches the version deployed on the running service (see
    "Cannot GET /" fix entry).
  - **Resolution `AGENTS.md`:** both blocks merged — HEAD block
    first (newest commits from PR #1 successor), then `06ee54f`
    block (PR #2), then seamlessly continuing with "Documentation:
    multi-line text input API explained" etc.
  - **Verified:** `npx tsc --noEmit` against `server/src/config.ts`
    (with `@types/node` + `dotenv` in `/tmp` sandbox) → exit 0, no
    TS1185 markers any more. No `node_modules` inside the repo
    (worktree state), full build only possible after
    `npm run install:all`.

- **2026-06-14 — "Cannot GET /" fix** (task `2c318cb9`):
  - **Bug:** After commit `18833b2` (`.env`-based `WEB_DIST`
    configuration) `npm run deploy` was not re-run → the installed
    `~/.config/systemd/user/mediary.service` contained no `WEB_DIST`.
    Plus a **second bug in `deploy.sh`**: `${VAR}\n` in double bash
    quotes is literal text, not a newline — the injected env lines
    all landed in **one** line and were ignored by the systemd
    parser. **Third bug:** `resolveFromRoot()` in the built
    `dist/config.js` resolved `WEB_DIST=../web/dist` to
    `/home/ubuntu/web/dist` (instead of `/home/ubuntu/mediary/web/dist`),
    because `SERVER_ROOT` in the build = `~/mediary` and `..` went
    beyond it.
  - **Fix 1:** `deploy.sh` now builds `SERVICE_ENV_LINES` as a bash
    array and writes the env lines into the service unit via `awk`
    (instead of `sed`). This puts each env variable on its own line.
  - **Fix 2:** `server/src/config.ts → resolveFromRoot()` resolves
    **all** relative paths from `.env` against `process.cwd()` (no
    longer against `SERVER_ROOT`). Recommended `WEB_DIST` value:
    `./web/dist` (relative to `WorkingDirectory=%h/mediary`).
  - **Hot fix on the running service:** `~/mediary/dist/config.js`
    patched directly, `~/.config/systemd/user/mediary.service`
    augmented with `Environment="WEB_DIST=./web/dist"`, service
    restarted. Verified: `GET /` → 200 (`index.html`),
    `GET /assets/...js` → 200, SPA fallback → 200, `/api/health` →
    200, `/api/substances` → 200.
  - **Follow-up for user:** run `npm run deploy` as soon as the
    source state should be consistent — the new `deploy.sh` now
    runs cleanly and writes the service unit correctly.

- **Existing features** (see README): versioned plan, 11 daily scales,
  Android APK, Markdown importer, light / dark "pharmacy" design.
