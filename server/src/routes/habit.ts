import { Router } from 'express';
import { z } from 'zod';
import { db, type HabitRow } from '../db.js';
import {
  consumptionDayFromUnix,
  dateOf,
  nowLocalISO,
  nowUnix,
  toLocalISO,
  unixToLocalISO,
} from '../lib/time.js';
import { serializeHabit } from '../lib/serialize.js';

export const habitRouter = Router();

/**
 * Daily "habit" data — currently only the daily **waking time**:
 * the time span from waking up to falling asleep, composed of intake
 * events and a webhook the local client (cron at 03:30 Europe/Berlin)
 * sends via `POST /api/habit/uptime`.
 *
 * Schema: see `daily_habits` in `server/src/db.ts`.
 *   - date (PRIMARY KEY, YYYY-MM-DD) — **always** the previous day from
 *     the webhook call's perspective (consumption day `today - 1`).
 *   - wake_first_unix (REAL, nullable) — Unix seconds of the first waking
 *     moment of the day. Algorithm: most recent intake of the previous day
 *     whose consumption day = previous day AND that lies between 03:30 and
 *     `first_user_interaction_24h_unix` — if present, that Unix time;
 *     otherwise `first_user_interaction_24h_unix`.
 *   - wake_last_unix  (REAL, nullable) — Unix seconds of the last waking
 *     moment: max(most recent intake of the previous day, `last_user_interaction_unix`).
 *
 * The webhook data no longer measures screen time but is treated as an
 * indicator of "still awake": `first_user_interaction_24h_unix` is the
 * earliest hint that the person was awake (at the PC) that day;
 * `last_user_interaction_unix` is the latest. Combined with intake
 * timestamps they approximate the waking window.
 */

const uptimeSchema = z.object({
  last_user_interaction_unix: z.number().finite().nonnegative(),
  first_user_interaction_24h_unix: z.number().finite().nonnegative(),
});

/**
 * Computes the previous consumption day (reference: consumption day `now`
 * minus 1 calendar day). The webhook typically fires at 03:30 — at that
 * point the consumption day of the previous day has JUST ended and the
 * "new" consumption day has not yet begun. We pick the previous day
 * hardcoded, independent of the actual `last_user_interaction_unix` (this
 * avoids misattribution if the client runs at a different time).
 */
function yesterdayConsumptionDay(): string {
  // Determine "today's" consumption day (local wall clock, 03:30 boundary).
  const todayIso = nowLocalISO(); // "YYYY-MM-DDTHH:mm:ss"
  const todayConsumption = dateOf(
    // consumptionDay() from time.ts inlined (the only spot that needs
    // consumption-day calculation — deliberately no circular import orgy).
    (() => {
      const day = todayIso.slice(0, 10);
      const minutes =
        Number(todayIso.slice(11, 13)) * 60 + Number(todayIso.slice(14, 16));
      if (minutes < 3 * 60 + 30) {
        const d = new Date(`${day}T12:00:00`);
        d.setDate(d.getDate() - 1);
        return toLocalISO(d).slice(0, 10) + todayIso.slice(10);
      }
      return todayIso;
    })(),
  );
  // minus 1 calendar day (date-wise, independent of the day boundary).
  const d = new Date(`${todayConsumption}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return toLocalISO(d).slice(0, 10);
}

/**
 * Reports the daily waking-time data for the **previous day** (from the
 * webhook call's perspective). Body: `{ last_user_interaction_unix,
 * first_user_interaction_24h_unix }` (Unix seconds, float allowed).
 *
 * Algorithm (see AGENTS.md "Habit/Waking time"):
 *   1. Target date = previous consumption day (today - 1).
 *   2. Intake `first` = latest intake timestamp on the previous day whose
 *      consumption day = previous day AND that lies between 03:30 (wall
 *      clock on the previous day) and `first_user_interaction_24h_unix`.
 *      If none → null.
 *   3. Intake `last` = latest intake timestamp on the previous day
 *      (consumption day = previous day), or null.
 *   4. `wake_first_unix` = (2) found → its Unix; otherwise
 *      `first_user_interaction_24h_unix`.
 *   5. `wake_last_unix` = max((3) Unix, `last_user_interaction_unix`).
 *
 * Response: stored habit record + debug fields.
 */
habitRouter.post('/uptime', (req, res) => {
  const parsed = uptimeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { last_user_interaction_unix: last, first_user_interaction_24h_unix: first } = parsed.data;

  if (first > last) {
    return res
      .status(400)
      .json({ error: 'first_user_interaction_24h_unix must be <= last_user_interaction_unix.' });
  }

  const now = nowUnix();
  // Plausibility checks (generous, so a 03:30 cron and manual catch-ups both
  // pass):
  //  - `last` (shortly before the cron) must be close to `now`: ±15 min
  //    (clock skew + scheduler delay; previously 10 min — slightly widened
  //    so a few seconds of delay do not get rejected).
  //  - `first` (24h-backlog point) may be up to ~25 h before `now`, so a
  //    genuine 24h window spanning the 03:30 day boundary is not silently
  //    rejected.
  const SLACK_LAST = 15 * 60;
  const MAX_BACK_FIRST = 25 * 3600;
  if (last > now + SLACK_LAST) {
    return res.status(400).json({ error: 'last_user_interaction_unix is in the future.' });
  }
  if (first < now - MAX_BACK_FIRST - SLACK_LAST) {
    return res
      .status(400)
      .json({ error: 'first_user_interaction_24h_unix is more than 25h in the past.' });
  }

  // Target date: previous consumption day (webhook = "report for the day that just ended").
  const targetDate = yesterdayConsumptionDay();

  // Load intakes for the target day. We search in the wall-clock range that
  // corresponds exactly to the consumption day `targetDate`:
  // [targetDate 03:30, target+1 03:29:59].
  // Precisely these intakes have `consumptionDay(taken_at) === targetDate`.
  const targetNext = new Date(`${targetDate}T12:00:00`);
  targetNext.setDate(targetNext.getDate() + 1);
  const targetNextStr = toLocalISO(targetNext).slice(0, 10);
  const dayStart = `${targetDate}T03:30:00`;
  const dayEnd = `${targetNextStr}T03:29:59`;

  // UNIX comparison instead of string comparison: `first` and `last` are
  // seconds. We need `taken_at` as Unix, so convert the local ISO string
  // to seconds since 1970-01-01 00:00:00 LOCAL. Local helper:
  const localIsoToUnix = (s: string): number => {
    // "YYYY-MM-DDTHH:mm:ss" -> Date (local) -> seconds since epoch (divided by 1000).
    // We use new Date(s) — it interprets ISO-8601 without TZ as LOCAL
    // (exactly the behaviour we want here in V8).
    return new Date(s).getTime() / 1000;
  };

  const rows = db
    .prepare(
      `SELECT taken_at FROM intakes
       WHERE taken_at >= ? AND taken_at <= ?
       ORDER BY taken_at ASC`,
    )
    .all(dayStart, dayEnd) as { taken_at: string }[];

  // Intake timestamps as a Unix-seconds list.
  const intakeUnixes = rows.map((r) => localIsoToUnix(r.taken_at));

  // `intakeFirst`: latest intake that lies AFTER 03:30 (day start) AND
  // BEFORE `first`. Semantically: "a medication intake on the previous day,
  // BEFORE the first PC interaction was reported" — the latest hint that
  // the person was already awake and active that day. If no such intake
  // exists (all intakes after `first`, or none at all) → null, and `first`
  // is used.
  // Note: NOT [first, last] — that would be the wrong range. We search
  // the interval [03:30, first).
  const dayStartUnix = localIsoToUnix(dayStart);
  const intakeFirst = (() => {
    let candidate: number | null = null;
    for (const u of intakeUnixes) {
      // Intakes are sorted ascending; once we are >= first we can stop.
      if (u >= first) break;
      // must be after 03:30 (= after day start)
      if (u >= dayStartUnix) candidate = u;
    }
    return candidate;
  })();

  // `intakeLast`: latest intake of the day (independent of `first`/`last`).
  const intakeLast = intakeUnixes.length > 0 ? intakeUnixes[intakeUnixes.length - 1] : null;

  // Final waking-time boundaries.
  const wakeFirstUnix = intakeFirst != null ? intakeFirst : first;
  const wakeLastUnix = Math.max(intakeLast ?? -Infinity, last);

  const nowIso = nowLocalISO();
  const isoLast = unixToLocalISO(last);
  const isoFirst = unixToLocalISO(first);
  db.prepare(
    `INSERT INTO daily_habits (date, wake_first_unix, wake_last_unix, created_at, updated_at)
     VALUES (@date, @wakeFirst, @wakeLast, @now, @now)
     ON CONFLICT(date) DO UPDATE SET
       wake_first_unix = @wakeFirst,
       wake_last_unix  = @wakeLast,
       updated_at      = @now`,
  ).run({ date: targetDate, wakeFirst: wakeFirstUnix, wakeLast: wakeLastUnix, now: nowIso });

  const row = db.prepare(`SELECT * FROM daily_habits WHERE date = ?`).get(targetDate) as HabitRow;
  res.status(200).json({
    ...serializeHabit(row),
    // Debug fields — useful when smoke-testing the cron and for the
    // algorithm's self-diagnostics; deliberately small payload.
    firstLocal: isoFirst,
    lastLocal: isoLast,
    firstDay: consumptionDayFromUnix(first),
    lastDay: consumptionDayFromUnix(last),
    targetDate,
    intakeFirstUnix: intakeFirst,
    intakeLastUnix: intakeLast,
  });
});

/**
 * List of habit days (range). `?from=&to=` (YYYY-MM-DD) bound the range.
 * Without filters: all existing days (ascending by date).
 */
habitRouter.get('/', (req, res) => {
  const where: string[] = [];
  const params: Record<string, unknown> = {};
  if (typeof req.query.from === 'string') {
    where.push(`date >= @from`);
    params.from = req.query.from.slice(0, 10);
  }
  if (typeof req.query.to === 'string') {
    where.push(`date <= @to`);
    params.to = req.query.to.slice(0, 10);
  }
  const rows = db
    .prepare(
      `SELECT * FROM daily_habits ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY date ASC`,
    )
    .all(params) as HabitRow[];
  res.json(rows.map(serializeHabit));
});

/** Single day. Returns 200 with exists=false if nothing is stored. */
habitRouter.get('/:date', (req, res) => {
  const date = req.params.date.slice(0, 10);
  const row = db.prepare(`SELECT * FROM daily_habits WHERE date = ?`).get(date) as HabitRow | undefined;
  if (!row) {
    return res.json({
      date,
      wakeFirstUnix: null,
      wakeLastUnix: null,
      exists: false,
    });
  }
  res.json({ ...serializeHabit(row), exists: true });
});

/** Delete a day (e.g. when the user discards the recording). */
habitRouter.delete('/:date', (req, res) => {
  const date = req.params.date.slice(0, 10);
  const info = db.prepare(`DELETE FROM daily_habits WHERE date = ?`).run(date);
  if (info.changes === 0) return res.status(404).json({ error: 'No habit record for this day' });
  res.status(204).end();
});

// (re-exported for tests / consumers that want to see the current "target" date)
export { dateOf, toLocalISO };
