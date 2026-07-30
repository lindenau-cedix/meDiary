import { Router } from 'express';
import { z } from 'zod';
import { reportFor, upsertReport, listReports, deleteReport } from '../db.js';
import { dreamTargetDate } from '../lib/dreams.js';
import { dateOf, nowLocalISO } from '../lib/time.js';
import { serializeReport } from '../lib/serialize.js';

export const reportRouter = Router();

/**
 * "Daily report" of the Hermes agent (what the agent did on a consumption
 * day — coding sessions, cron runs, deploys, errors, sub-agent spawns …).
 *
 * Written by the 03:30 Berlin cron via POST /api/report/new. Read by the
 * nightly "dreaming" as an additional context section (see
 * `gatherDreamContext` in `lib/dreams.ts`).
 *
 * Date model: the report belongs to the **consumption day**, which ends at
 * 03:30 — the same day that is dreamed about 42 minutes later. POST without
 * `date` therefore defaults to `dreamTargetDate(now)` (the consumption
 * previous day), exactly like the dream generator at 04:20 — keeping both
 * cron jobs consistent.
 *
 * The endpoint is open (private deployment, like the rest of the read API).
 * The writing cron runs on the same host; if an external sender joins in the
 * future, the auth gate is the same as for POST /api/intakes/text
 * (Cloudflare Access → CF_ACCESS_DISABLED).
 */

// Upper limit for the free-text payload. 64 KiB is enough for several
// thousand lines of Markdown and protects against abuse / accidental
// giant uploads.
const MAX_REPORT_LEN = 64 * 1024;

const reportSchema = z.object({
  /**
   * Consumption day the report belongs to (YYYY-MM-DD). Default = previous
   * consumption day (`dreamTargetDate(now)`), i.e. exactly the day the
   * dream is about. The 03:30 trigger cron does not need to send a date.
   */
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD')
    .optional(),
  /** Free-text report (Markdown or plain). Not empty, max 64 KiB. */
  report: z.string().min(1, 'report must not be empty').max(MAX_REPORT_LEN),
  /** Optional marker for who submitted the report (e.g. "hermes-cron-0330"). */
  source: z.string().max(120).optional(),
});

/**
 * Create / overwrite the daily report. Idempotent: the same `date`
 * overwrites the previous entry (updated_at is bumped).
 *
 * Body: `{ date?: "YYYY-MM-DD", report: string, source?: string }`.
 *  - 200 + `{ exists: true, date, report, source, createdAt, updatedAt }`
 *  - 400 on invalid payload / empty report / validation failure
 */
reportRouter.post('/new', (req, res) => {
  const parsed = reportSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const now = nowLocalISO();
  const date = parsed.data.date ?? dateOf(dreamTargetDate(now));
  const source = parsed.data.source ?? null;

  const row = upsertReport(date, parsed.data.report, source);
  res.json({ ...serializeReport(row), exists: true });
});

/** Single daily report (always 200, `exists:false` when empty). */
reportRouter.get('/:date', (req, res) => {
  const date = req.params.date.slice(0, 10);
  const row = reportFor(date);
  if (!row) return res.json({ date, exists: false });
  res.json({ ...serializeReport(row), exists: true });
});

/**
 * List of daily reports (newest first). `?from=&to=&limit=`. Useful for the
 * frontend when rendering a weekly/monthly view of agent activity.
 */
reportRouter.get('/', (req, res) => {
  const from = typeof req.query.from === 'string' ? req.query.from : undefined;
  const to = typeof req.query.to === 'string' ? req.query.to : undefined;
  const limitRaw = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
  const limit = Number.isFinite(limitRaw) ? limitRaw : undefined;
  const reports = listReports({ from, to, limit }).map(serializeReport);
  res.json({ reports });
});

/** Delete a daily report (204 / 404). */
reportRouter.delete('/:date', (req, res) => {
  const date = req.params.date.slice(0, 10);
  if (!deleteReport(date)) return res.status(404).json({ error: 'No report for this day' });
  res.status(204).end();
});