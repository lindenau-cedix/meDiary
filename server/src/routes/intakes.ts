import { Router } from 'express';
import { z } from 'zod';
import { db, type IntakeRow, type SubstanceRow } from '../db.js';
import { nowLocalISO, normalizeDateTime, consumptionDay } from '../lib/time.js';
import { defaultsFor } from '../lib/defaults.js';
import { findOrCreateSubstance } from '../lib/substances.js';
import { serializeIntake } from '../lib/serialize.js';

export const intakesRouter = Router();

const createSchema = z.object({
  substanceId: z.number().int().nullish(),
  substanceName: z.string().trim().min(1).optional(),
  takenAt: z.string().optional(), // default: jetzt
  amount: z.string().trim().nullish(),
  notes: z.string().nullish(),
});

intakesRouter.get('/', (req, res) => {
  const { from, to, substanceId, limit } = req.query;
  const where: string[] = [];
  const params: Record<string, unknown> = {};
  if (typeof from === 'string') {
    where.push(`taken_at >= @from`);
    params.from = from.length === 10 ? `${from}T00:00:00` : from;
  }
  if (typeof to === 'string') {
    where.push(`taken_at <= @to`);
    params.to = to.length === 10 ? `${to}T23:59:59` : to;
  }
  if (typeof substanceId === 'string') {
    where.push(`substance_id = @substanceId`);
    params.substanceId = Number(substanceId);
  }
  const lim = typeof limit === 'string' ? Math.min(Number(limit) || 500, 2000) : 500;
  const rows = db
    .prepare(
      `SELECT * FROM intakes
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY taken_at DESC, id DESC
       LIMIT ${lim}`,
    )
    .all(params) as IntakeRow[];
  res.json(rows.map(serializeIntake));
});

intakesRouter.post('/', (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const d = parsed.data;

  // Substanz auflösen: per ID, sonst per Name. Wird der Name nicht gefunden,
  // wird er als QuickPick (= Substanz-Kachel) automatisch angelegt, damit
  // jeder jemals eingetragene Stoff beim nächsten Mal tippbar ist.
  let substance: SubstanceRow | undefined;
  let createdSubstance = false;
  if (d.substanceId != null) {
    substance = db.prepare(`SELECT * FROM substances WHERE id = ?`).get(d.substanceId) as SubstanceRow | undefined;
    if (!substance) return res.status(400).json({ error: 'Substanz nicht gefunden' });
  } else if (d.substanceName) {
    const before = db
      .prepare(`SELECT id, name FROM substances`)
      .all() as { id: number; name: string }[];
    const wanted = d.substanceName.trim().toLocaleLowerCase('de');
    const existing = before.find((s) => s.name.trim().toLocaleLowerCase('de') === wanted);
    substance = findOrCreateSubstance(d.substanceName);
    createdSubstance = !existing;
  }

  const substanceName = substance?.name ?? d.substanceName;
  if (!substanceName) return res.status(400).json({ error: 'substanceId oder substanceName erforderlich' });

  const takenAt = d.takenAt ? normalizeDateTime(d.takenAt) : nowLocalISO();

  // DEFAULTS.md wird bei jedem Schreibvorgang frisch gelesen (Notiz + Menge).
  // Vorrang: explizite Angabe > Substanz-Standarddosis > DEFAULTS.md.
  const def = defaultsFor(substanceName);
  const amount = d.amount?.trim() || substance?.default_dose || def.amount || null;
  const notes = d.notes?.trim() || def.note || null;

  const info = db
    .prepare(
      `INSERT INTO intakes (substance_id, substance_name, taken_at, amount, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(substance?.id ?? null, substanceName, takenAt, amount, notes, nowLocalISO());

  const row = db.prepare(`SELECT * FROM intakes WHERE id = ?`).get(info.lastInsertRowid) as IntakeRow;

  // Nachtmedikations-Erkennung -> Tages-Assessment anbieten
  const isNightMed = !!substance?.is_night_med;
  let assessmentDate: string | null = null;
  let assessmentExists = false;
  if (isNightMed) {
    assessmentDate = consumptionDay(takenAt);
    assessmentExists =
      !!db.prepare(`SELECT 1 FROM daily_assessments WHERE date = ?`).get(assessmentDate);
  }

  res.status(201).json({
    intake: serializeIntake(row),
    nightMed: isNightMed,
    assessmentDate,
    assessmentExists,
    createdSubstance,
  });
});

intakesRouter.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare(`SELECT * FROM intakes WHERE id = ?`).get(id) as IntakeRow | undefined;
  if (!existing) return res.status(404).json({ error: 'Eintrag nicht gefunden' });

  const parsed = z
    .object({
      takenAt: z.string().optional(),
      amount: z.string().nullish(),
      notes: z.string().nullish(),
      substanceName: z.string().trim().min(1).optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const d = parsed.data;

  db.prepare(
    `UPDATE intakes SET
       taken_at = @takenAt,
       amount = @amount,
       notes = @notes,
       substance_name = @substanceName
     WHERE id = @id`,
  ).run({
    id,
    takenAt: d.takenAt ? normalizeDateTime(d.takenAt) : existing.taken_at,
    amount: d.amount === undefined ? existing.amount : d.amount?.trim() || null,
    notes: d.notes === undefined ? existing.notes : d.notes?.trim() || null,
    substanceName: d.substanceName ?? existing.substance_name,
  });
  const row = db.prepare(`SELECT * FROM intakes WHERE id = ?`).get(id) as IntakeRow;
  res.json(serializeIntake(row));
});

intakesRouter.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const info = db.prepare(`DELETE FROM intakes WHERE id = ?`).run(id);
  if (info.changes === 0) return res.status(404).json({ error: 'Eintrag nicht gefunden' });
  res.status(204).end();
});
