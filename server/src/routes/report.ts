import { Router } from 'express';
import { z } from 'zod';
import { reportFor, upsertReport, listReports, deleteReport } from '../db.js';
import { dreamTargetDate } from '../lib/dreams.js';
import { dateOf, nowLocalISO } from '../lib/time.js';
import { serializeReport } from '../lib/serialize.js';

export const reportRouter = Router();

/**
 * „Tagesbericht" des Hermes-Agents (was der Agent an einem Konsum-Tag getan
 * hat — Coding-Sessions, Cron-Läufe, Deploys, Fehler, subagent-Spawns …).
 *
 * Geschrieben vom 03:30-Berlin-Cron per POST /api/report/new. Wird vom
 * nächtlichen „Träumen" als zusätzliche Kontext-Sektion gelesen (siehe
 * `gatherDreamContext` in `lib/dreams.ts`).
 *
 * Datums-Modell: Der Bericht gehört zum **Konsum-Tag**, der um 03:30 endet —
 * derselbe Tag, über den 42 Minuten später geträumt wird. POST ohne `date`
 * schreibt daher per Default auf `dreamTargetDate(now)` (Konsum-Vortag), genau
 * wie der Traum-Generator um 04:20 — Konsistenz zwischen beiden Cron-Jobs.
 *
 * Der Endpoint ist offen (privates Deployment, wie der Rest der Lese-API).
 * Schreibender Cron läuft auf demselben Host; falls künftig ein externer
 * Sender ins Spiel kommt, ist die Auth-Stelle dieselbe wie bei
 * POST /api/intakes/text (Cloudflare Access → CF_ACCESS_DISABLED).
 */

// Obergrenze für den Freitext. 64 KiB reichen für mehrere tausend Zeilen
// Markdown und schützt vor Missbrauch / versehentlichem Riesenupload.
const MAX_REPORT_LEN = 64 * 1024;

const reportSchema = z.object({
  /**
   * Konsum-Tag, zu dem der Bericht gehört (YYYY-MM-DD). Default =
   * Konsum-Vortag (`dreamTargetDate(now)`), also genau der Tag, über den
   * gleich geträumt wird. Auslöser-Cron um 03:30 muss nichts mitsenden.
   */
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date muss YYYY-MM-DD sein')
    .optional(),
  /** Freitext-Bericht (Markdown oder Plain). Nicht leer, max. 64 KiB. */
  report: z.string().min(1, 'report darf nicht leer sein').max(MAX_REPORT_LEN),
  /** Optionaler Marker, wer den Bericht eingeliefert hat (z. B. "hermes-cron-0330"). */
  source: z.string().max(120).optional(),
});

/**
 * Tagesbericht anlegen / überschreiben. Idempotent: derselbe `date`
 * überschreibt den vorherigen Eintrag (updated_at wird hochgezogen).
 *
 * Body: `{ date?: "YYYY-MM-DD", report: string, source?: string }`.
 *  - 200 + `{ exists: true, date, report, source, createdAt, updatedAt }`
 *  - 400 bei ungültigem Payload / leerem Report / fehlgeschlagener Validierung
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

/** Einzelner Tagesbericht (immer 200, `exists:false` wenn leer). */
reportRouter.get('/:date', (req, res) => {
  const date = req.params.date.slice(0, 10);
  const row = reportFor(date);
  if (!row) return res.json({ date, exists: false });
  res.json({ ...serializeReport(row), exists: true });
});

/**
 * Liste der Tagesberichte (neueste zuerst). `?from=&to=&limit=`. Nützlich für
 * das Frontend, wenn man eine Wochen-/Monatsansicht der Agent-Aktivität
 * rendern will.
 */
reportRouter.get('/', (req, res) => {
  const from = typeof req.query.from === 'string' ? req.query.from : undefined;
  const to = typeof req.query.to === 'string' ? req.query.to : undefined;
  const limitRaw = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
  const limit = Number.isFinite(limitRaw) ? limitRaw : undefined;
  const reports = listReports({ from, to, limit }).map(serializeReport);
  res.json({ reports });
});

/** Tagesbericht löschen (204 / 404). */
reportRouter.delete('/:date', (req, res) => {
  const date = req.params.date.slice(0, 10);
  if (!deleteReport(date)) return res.status(404).json({ error: 'Kein Bericht für diesen Tag' });
  res.status(204).end();
});