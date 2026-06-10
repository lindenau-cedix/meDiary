import { Router } from 'express';
import { z } from 'zod';
import { db, type AssessmentRow } from '../db.js';
import { nowLocalISO } from '../lib/time.js';
import { serializeAssessment } from '../lib/serialize.js';
import { METRIC_KEYS } from '../lib/metrics.js';

export const assessmentsRouter = Router();

/** Liste für Trends. ?from=YYYY-MM-DD&to=YYYY-MM-DD (aufsteigend nach Datum). */
assessmentsRouter.get('/', (req, res) => {
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
    .prepare(`SELECT * FROM daily_assessments ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY date ASC`)
    .all(params) as AssessmentRow[];
  res.json(rows.map(serializeAssessment));
});

/** Einzelner Tag. Liefert immer 200 (mit exists-Flag), zum Vorbefüllen des Sheets. */
assessmentsRouter.get('/:date', (req, res) => {
  const date = req.params.date.slice(0, 10);
  const row = db.prepare(`SELECT * FROM daily_assessments WHERE date = ?`).get(date) as AssessmentRow | undefined;
  if (!row) return res.json({ date, scores: {}, note: null, exists: false });
  res.json({ ...serializeAssessment(row), exists: true });
});

const scoresSchema = z.record(z.number().int().min(1).max(10));

/** Upsert eines Tages-Assessments. */
assessmentsRouter.put('/:date', (req, res) => {
  const date = req.params.date.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Ungültiges Datum' });

  const parsed = z.object({ scores: scoresSchema, note: z.string().nullish() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  // nur bekannte Metriken zulassen
  const scores: Record<string, number> = {};
  for (const [k, v] of Object.entries(parsed.data.scores)) {
    if (METRIC_KEYS.includes(k)) scores[k] = v;
  }

  const now = nowLocalISO();
  db.prepare(
    `INSERT INTO daily_assessments (date, scores, note, created_at, updated_at)
     VALUES (@date, @scores, @note, @now, @now)
     ON CONFLICT(date) DO UPDATE SET
       scores = @scores,
       note = @note,
       updated_at = @now`,
  ).run({ date, scores: JSON.stringify(scores), note: parsed.data.note ?? null, now });

  const row = db.prepare(`SELECT * FROM daily_assessments WHERE date = ?`).get(date) as AssessmentRow;
  res.json({ ...serializeAssessment(row), exists: true });
});

assessmentsRouter.delete('/:date', (req, res) => {
  const date = req.params.date.slice(0, 10);
  const info = db.prepare(`DELETE FROM daily_assessments WHERE date = ?`).run(date);
  if (info.changes === 0) return res.status(404).json({ error: 'Kein Assessment für diesen Tag' });
  res.status(204).end();
});
