# meDiary — API reference

> Part of the meDiary project docs — overview & index in [CLAUDE.md](../CLAUDE.md).

## API reference (excerpt)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | Status |
| `GET` | `/api/metrics` | 11 daily scales |
| `GET/POST` | `/api/substances` | List/create substances |
| `PATCH/DELETE` | `/api/substances/:id` | Edit / archive (`?hard=true` deletes) |
| `POST` | `/api/substances/reorder` | Set tile order (`{ ids: number[] }` → `sort_order = index`) |
| `GET/POST` | `/api/intakes` | Intakes (DEFAULTS logic, auto-vivification) |
| `POST` | `/api/intakes/plan-batch` | Enter all plan substances of a slot at once ("Morning meds" / "Night meds", `{ slot, takenAt? }`) |
| `POST` | `/api/intakes/batch` | Multiple freely chosen substances at once — shared `takenAt`, each with own amount/note (`{ takenAt?, companions?, entries: [{ substanceId? \| substanceName?, amount?, notes? }] }`) |
| `POST` | `/api/intakes/text` | Convert multi-line free text (format: SAMPLES.md) into intakes — **Cloudflare Access protected**, with DB verification in the response |
| `PATCH/DELETE` | `/api/intakes/:id` | Edit / delete |
| `GET` | `/api/plan` | Currently effective plan + `upcoming` (planned future versions) |
| `GET` | `/api/plan/at?date=…` \| `?days=N` | Plan as of date/time (`date` also `YYYY-MM-DDTHH:mm`) |
| `GET` | `/api/plan/diff?days=N` | Plan diff |
| `GET` | `/api/plan/versions` | Version history (sorted by effective date, with `active` / `upcoming` flags) |
| `PUT` | `/api/plan` | New plan version; optional `effectiveFrom: "YYYY-MM-DD"` or `"YYYY-MM-DDTHH:mm"` (retroactive / future, default today) |
| `GET` | `/api/assessments?from=&to=` | Daily assessments (trends) |
| `GET/PUT/DELETE` | `/api/assessments/:date` | Read / save / delete assessment |
| `GET/PUT` | `/api/defaults` | Read / write DEFAULTS.md |
| `PUT` | `/api/defaults/sections` | Write structured sections (see below) — **CF-Access** |
| `GET` | `/api/defaults/check` | DEFAULTS compliance report |
| `GET` | `/api/diary/notes?from=&to=` | Short version: list of notes per consumption day (intake notes + assessment + wake-time habit + **Hermes agent daily report**). Days count as "noteworthy" as soon as ONE of these sources exists — even a pure agent report without medication data appears. |
| `GET` | `/api/diary` | State of the AI full diary (`raw`, `entries[]`, `generatedDays` / `pendingDays`, `available`) |
| `POST` | `/api/diary/generate` | Generate AI full text (`{ scope?: 'missing' \| 'all', from?, to?, max? }`); 503 without `ANTHROPIC_API_KEY` |
| `PUT` | `/api/diary` | Manually overwrite the diary file (`{ content }`) |
| `POST` | `/api/habit/uptime` | Report daily **wake time** (`{ last_user_interaction_unix, first_user_interaction_24h_unix }`); target date = **previous consumption day**; computes `wake_first` / `wake_last` from intakes + webhook, feeds into `gatherDiaryDays()` (short + AI prompt) |
| `GET` | `/api/habit?from=&to=` | List of habit days (range) |
| `GET` | `/api/habit/:date` | Single habit day (always 200, `exists: false` if empty) |
| `DELETE` | `/api/habit/:date` | Delete habit record (204 / 404) |
| `GET` | `/api/dreams?from=&to=&limit=` | Dreams (nightly assessments), newest first; `{ dreams, available, busy }` |
| `GET` | `/api/dreams/latest` | Newest dream (startup dialog); `{ …, exists, available }` |
| `POST` | `/api/dreams/generate` | Manual trigger (`{ date?, force? }`); **token-primary** (`X-Dream-Token`), fail-closed (403 without auth, 429 rate limit, 503 without `MINIMAX_API_KEY`, 409 if one is already running) |
| `GET` | `/api/dreams/:date` | Single dream (always 200, `exists: false` if empty) |
| `DELETE` | `/api/dreams/:date` | Delete dream (204 / 404) |
| `POST` | `/api/report/new` | Submit Hermes agent daily report (`{ date?, report, source? }`); idempotent upsert per consumption day (default `date` = `dreamTargetDate(now)`, i.e. previous consumption day — matches the 03:30 Berlin cron and the dream target at 04:20). Feeds into the dream context (see `gatherDreamContext`). 200 with `{ date, report, source, createdAt, updatedAt, exists }`; 400 for empty / too-long `report`. |
| `GET` | `/api/report?from=&to=&limit=` | Daily report list (newest first); `{ reports[] }` |
| `GET` | `/api/report/:date` | Single daily report (always 200, `exists:false` if empty) |
| `DELETE` | `/api/report/:date` | Delete daily report (204 / 404) |
| `GET` | `/api/ingredients` | "Ingredient balance" statistics: cached AI ingredient profiles per substance. `{ available, model, profiles: {[nameKey]: { name, profile, model, updatedAt, stale }}, missing[], stale[], total }`. Open read. |
| `POST` | `/api/ingredients/analyze` | Analyze substances via AI + cache (`{ scope?: 'missing' \| 'all' }`); returns `{ analyzed, skipped, total, errors[], state }`. **CF-Access**, 409 if a run is already active (busy lock). Runs by default via the **MiniMax subscription** (`config.ingredients`: `INGREDIENTS_API_KEY` > `CHAT_API_KEY` > `MINIMAX_API_KEY`, model `MiniMax-M3`); 503 if none of them is set. |
| `GET` | `/api/chat/status` | Data console: `{ available, model }` (`available:false` without key) |
| `GET` | `/api/chat/change-sets?limit=` | Change-set audit log (newest first); `{ changeSets[], latestAppliedId, available }` |
| `GET` | `/api/chat/change-sets/:id` | Single change set (`{ changeSet, latestAppliedId }`, 404) |
| `POST` | `/api/chat/message` | **SSE** — natural-language request (`{ message, history? }`); streams `token` / `thinking` / `tool` / `changeset` / `done` / `error`. **CF-Access**, rate-limited, 503 without key |
| `POST` | `/api/chat/change-sets/:id/apply` | Apply change set (transactional + undo snapshot); 409 if not `proposed`. **CF-Access** |
| `POST` | `/api/chat/change-sets/:id/undo` | Undo the most recently applied change set; 409 otherwise. **CF-Access** |
| `POST` | `/api/chat/change-sets/:id/discard` | Discard a proposed change set; 409 if not `proposed`. **CF-Access** |

### `PUT /api/defaults/sections`

Structured DEFAULTS.md mutation. The web editor (`/standardnotizen`) sends one
entry per substance; the server validates (duplicate names case-insensitive via
`nameKey`, no self-reference as companion, length caps), serializes back to
Markdown and writes atomically. The document title (`# DEFAULTS.md`) and
everything before the first `## …` section is preserved; lines under a section
that can't be interpreted as `Menge:` / `Notiz:` / `Mit:` (e.g.
`NACH 2026-08-01 12:00 CEST: …` or `DAVOR: …`) are carried over losslessly as
`preLines` / `postLines` of the respective section.

**Auth:** Cloudflare Access, fail-closed (see env table). `CF_ACCESS_DISABLED=true`
is the dev bypass; locally that's perfectly enough for smoke tests.

> **Default amount = single source of truth in DEFAULTS.md.** The `defaultDose`
> field of `POST/PATCH /api/substances` is NOT written to the DB column
> `substances.default_dose`, but on the server side via `upsertSectionAmount()`
> as `Menge:` of the respective section into `DEFAULTS.md` (note / `Mit:` /
> comments remain untouched). `GET /api/substances` reads `defaultDose` back
> via `defaultAmountFor(name)` from the file. The DB column is decommissioned
> (kept only for the undo snapshot restore in the schema). At server startup an
> idempotent migration (`migrateDefaultDosesToDefaultsFile`) transfers any
> still-present DB values into `DEFAULTS.md` — existing `Menge:` entries win
> on conflict — and empties the column.

**Request** (`PUT /api/defaults/sections`):

```json
{
  "sections": [
    {
      "name": "Modafinil",
      "amount": "100 mg",
      "note": "morgens",
      "companions": [],
      "preLines": [],
      "postLines": []
    },
    {
      "name": "L-Theanin",
      "amount": "400 mg",
      "note": null,
      "companions": [
        { "name": "Lemon Balm", "amount": "100 mg", "note": null }
      ],
      "preLines": [],
      "postLines": []
    }
  ]
}
```

- `amount` / `note` / `companion.amount` / `companion.note`: `string | null`, ≤ 80 or 1000 chars.
- `preLines` / `postLines`: `string[]` — lines the frontend doesn't want to
  maintain structurally (e.g. `NACH …` caveats). Reinserted 1:1 with a blank
  line as separator back into the Markdown text.
- Empty sections (all `null` / `[]`) are silently dropped.

**Response (200):** same shape as `GET /api/defaults` —
`{ defaults, raw }` (freshly parsed + raw text after writing).

**Errors:**

| Status | Meaning |
|---|---|
| 400 | Duplicate name (case-insensitive), companion = section itself, name empty / too long, `amount` / `note` too long, zod validation failed |
| 401/403 | Cloudflare Access not satisfied (fail-closed) |
| 503 | Server without `DEFAULTS_PATH` configured or file not writable |

`POST /api/intakes` returns `{ intake, nightMed, assessmentDate, assessmentExists, createdSubstance, companions }` — `createdSubstance: true` means the name was new and was created as a QuickPick; `companions` (`{ intake, createdSubstance }[]`) are the auto-recorded companion intakes from `Mit:` defaults (empty if none).

`POST /api/intakes/plan-batch` (`{ slot: "morning" | "noon" | "evening" | "night", takenAt? }`) records **all** substances of the plan effective at `takenAt` that have a dose in the given slot — the batch entries "Morning meds" (morning) and "Night meds" (night) in the Today tab. Per substance the same resolution applies as with `POST /` (amount: DEFAULTS > plan `strength`; note from DEFAULTS), auto-vivification included (`source_event_id = planbatch:<slot>`). Companion substances (`Mit:`) are deliberately NOT recorded here (the plan is the authoritative list; otherwise duplicates). Response: `{ slot, count, entries: { intake, createdSubstance }[], nightMed, assessmentDate, assessmentExists }`. As with `POST /`, completing all night meds also triggers the daily assessment here.

`POST /api/intakes/text` (body: JSON `{ text, dryRun?, companions? }` or directly `text/plain`) converts multi-line free text into intakes. Format per line see **SAMPLES.md** in the project root: optional prefix `DD.MM(.YYYY) HH:MM:` (no year = current, no date = today), just `HH:MM:`, `jetzt:` or no prefix (= current time); then entries `Substanz Menge (Notiz)`, separated by commas and/or " und " (decimal commas like `0,5 ml` and bracket contents don't split). **Amount and substance may appear in either order** — "Pregabalin 100 mg" as well as "100mg Pregabalin" / "200 mg Lorazepam": an already KNOWN substance name (all names, active + archived, are passed to `parseFreeText`) separates amount and note (amount before/after, free note after without brackets, e.g. "150mg Pregabalin morgens"); if the name is unknown, a leading amount WITH unit counts as amount and the rest as a new name, otherwise substance-first (amount from the first number token, for sequences like "Omega 3 500 mg" from the last of the number sequence — a leading number without unit like "300 Baldrian" counts as amount). **Amount and/or note may be omitted — then the DEFAULTS.md values apply** (amount: text > DEFAULTS; note: bracket > DEFAULTS note). Auto-vivification as with `POST /`. **`Mit:` companion substances from DEFAULTS.md are — as with `POST /` — automatically recorded per entry as separate intakes at the same time** (e.g. Theanin → Lemon Balm), one level deep, self-reference skipped, `source_event_id = companion:<main-id>`; `companions: false` in the JSON body disables this. Each line is processed individually and is atomic — a faulty entry makes the whole line a `lineErrors` element, the other lines are still created (all inserts of one request in one transaction, `source_event_id = text:<timestamp>` as batch marker for the main entries). **After writing the endpoint reads the entries (including companions) fresh from the DB** and reports which actually arrived. Response (201): `{ batchId, lineCount, requested, created, verified, entries: { line, createdSubstance, verified, intake, companions: { createdSubstance, verified, intake }[] }[], lineErrors: { line, text, error }[] }` — `requested` counts the main entries, `created` all verified entries (main + companion), `verified` is true exactly when every planned insert was found in the DB. 400 if no entry could be parsed; `dryRun: true` returns only the parse result (with companion preview `entries[].companions[]`) without writing. **Access protection:** Cloudflare Access (see env table) — without configuration the endpoint responds 503 (fail-closed); `CF_ACCESS_DISABLED=true` is the dev bypass.

**Quick reference for `/api/intakes/text` for external clients:** Run locally /
smoke-test with `CF_ACCESS_DISABLED=true`; in production call via the
Cloudflare Access-protected URL (login cookie or service token at the Cloudflare
edge; at the origin the resulting JWT is validated from `Cf-Access-Jwt-Assertion`
or `CF_Authorization`). Before real writes send `dryRun: true` first. Example:

```bash
curl -sS -X POST "$MEDIARY_URL/api/intakes/text" \
  -H 'Content-Type: application/json' \
  -d '{"dryRun":true,"text":"12.06.2026 08:30: Elvanse 30mg (nüchtern), Lithium 300 mg\njetzt: Theanin"}'
```

For the actual import omit `dryRun`; if no automatic `Mit:` companion
substances should be created, send `{ "companions": false }`. `text/plain` also
works:

```bash
curl -sS -X POST "$MEDIARY_URL/api/intakes/text" \
  -H 'Content-Type: text/plain' \
  --data-binary $'08:30: Elvanse 30mg (nuechtern)\njetzt: Theanin'
```

## WhatsApp & delivery (`/api/whatsapp`, `/api/deliveries`)

Dream delivery is a separate concern from dream generation. Generation runs in
the scheduler at `DREAM_TIME`; delivery runs as a follow-up step that posts
the formatted text + TTS voice note to WhatsApp. All state is tracked in
`dream_deliveries` for the in-app log.

### `GET /api/whatsapp/status`
**Auth:** open read.
**Returns:** `{ state, hasCreds, lastConnectedAt, lastQrAt, lastError, configured, adminEnabled, jid }` where `state ∈ {disconnected, connecting, qr, connected}`.

### `GET /api/whatsapp/qr`
**Auth:** CF-Access protected (admin).
**Returns:** `{ qr: <base64 PNG> }` (the QR as base64, no data: prefix) when `state === 'qr'`. **404** otherwise.

### `POST /api/whatsapp/reconnect`
**Auth:** CF-Access protected (admin).
**Returns:** `202 { ok: true }` — kicks off logout + creds wipe + reconnect. Use the admin UI's "Reconnect" button to see the fresh QR.

### `POST /api/whatsapp/test`
**Auth:** CF-Access protected (admin).
**Returns:** `{ ok, recipient? }` on success, or `503 { error }` on failure. Sends a test text to the first enabled target.

### `GET /api/whatsapp/targets` / `POST /api/whatsapp/targets`
**Auth:** CF-Access protected (admin).
**GET** → `{ targets: DeliveryTarget[] }`. **POST** body `{ phone, displayName? }` → `{ target }` (201). Phone must be 8–15 digits.

### `GET /api/deliveries`
**Auth:** open read.
**Query:** `?dream_date=YYYY-MM-DD&limit=N` (limit 1–500, default 100).
**Returns:** `{ deliveries: DreamDelivery[] }` where each has `{ id, dreamDate, channel, recipient, status, voiceStatus, attempts, error, sentAt, createdAt, updatedAt }`. `status ∈ {pending, sent, failed, abandoned}`. `voiceStatus ∈ {none, sent, failed}`.

### `POST /api/dreams/:date/redeliver`
**Auth:** CF-Access protected (admin).
**Returns:** `{ date, attempted, sent, failed }`. Resets the matching `dream_deliveries` rows to `status='pending'`, increments attempts, and re-runs the delivery (text + voice). No body required.
