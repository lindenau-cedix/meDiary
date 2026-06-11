import express, { Router } from 'express';
import { z } from 'zod';
import { db, type IntakeRow, type SubstanceRow, allNightMedsTaken } from '../db.js';
import { nowLocalISO, normalizeDateTime, consumptionDay } from '../lib/time.js';
import { defaultsFor } from '../lib/defaults.js';
import { findOrCreateSubstance, nameKey } from '../lib/substances.js';
import { serializeIntake } from '../lib/serialize.js';
import { XLSX_MIME, buildIntakesWorkbook, parseIntakesWorkbook, type IntakeXlsxRow } from '../lib/intakes_xlsx.js';

export const intakesRouter = Router();

/** Fügt zwischen Zahl und Buchstabe ein Leerzeichen ein: "100ml" → "100 ml" */
function normalizeAmount(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Zwischen Ziffer und Buchstabe (Einheiten wie ml, mg, µg etc.)
  return trimmed.replace(/(\d)([a-zA-ZäöüÄÖÜßµ])/g, '$1 $2');
}

const createSchema = z.object({
  substanceId: z.number().int().nullish(),
  substanceName: z.string().trim().min(1).optional(),
  takenAt: z.string().optional(), // default: jetzt
  amount: z.string().trim().nullish(),
  notes: z.string().nullish(),
  companions: z.boolean().optional(), // false = "Mit:"-Begleitsubstanzen nicht miterfassen (z. B. Backfill-Skripte)
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

intakesRouter.get('/export.xlsx', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT taken_at AS takenAt,
              substance_name AS substanceName,
              amount,
              notes,
              created_at AS createdAt
         FROM intakes
        ORDER BY taken_at ASC, id ASC`,
    )
    .all() as IntakeXlsxRow[];
  const workbook = buildIntakesWorkbook(rows);
  const date = nowLocalISO().slice(0, 10);
  res.setHeader('Content-Type', XLSX_MIME);
  res.setHeader('Content-Disposition', `attachment; filename="meDiary-konsumvorgaenge-${date}.xlsx"`);
  res.send(workbook);
});

const importRaw = express.raw({
  type: [XLSX_MIME, 'application/octet-stream', 'application/zip'],
  limit: '15mb',
});

const replaceIntakesFromXlsx = db.transaction((rows: IntakeXlsxRow[]) => {
  const replaced = (db.prepare(`SELECT COUNT(*) AS c FROM intakes`).get() as { c: number }).c;
  const substancesBefore = (db.prepare(`SELECT COUNT(*) AS c FROM substances`).get() as { c: number }).c;
  db.prepare(`DELETE FROM intakes`).run();

  const insert = db.prepare(
    `INSERT INTO intakes (substance_id, substance_name, taken_at, amount, notes, created_at)
     VALUES (@substanceId, @substanceName, @takenAt, @amount, @notes, @createdAt)`,
  );
  for (const row of rows) {
    const substance = findOrCreateSubstance(row.substanceName);
    insert.run({
      substanceId: substance.id,
      substanceName: row.substanceName,
      takenAt: row.takenAt,
      amount: row.amount,
      notes: row.notes,
      createdAt: row.createdAt,
    });
  }

  const substancesAfter = (db.prepare(`SELECT COUNT(*) AS c FROM substances`).get() as { c: number }).c;
  return { imported: rows.length, replaced, createdSubstances: substancesAfter - substancesBefore };
});

intakesRouter.post('/import', importRaw, (req, res) => {
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    return res.status(400).json({ error: 'Keine XLSX-Datei empfangen' });
  }

  let rows: IntakeXlsxRow[];
  try {
    rows = parseIntakesWorkbook(req.body);
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message });
  }

  const result = replaceIntakesFromXlsx(rows);
  res.json(result);
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
  const amount = normalizeAmount(d.amount) || substance?.default_dose || def.amount || null;
  const notes = d.notes?.trim() || def.note || null;

  const insertIntake = db.prepare(
    `INSERT INTO intakes (substance_id, substance_name, taken_at, amount, notes, created_at, source_event_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const selectIntake = db.prepare(`SELECT * FROM intakes WHERE id = ?`);

  // Begleitsubstanzen aus DEFAULTS "Mit:" im selben Schritt miterfassen —
  // bewusst nur eine Ebene tief ("Mit:" der Begleitsubstanz wird nicht
  // verfolgt, keine Ketten/Zyklen). `companions: false` schaltet das ab.
  interface CompanionCreated {
    row: IntakeRow;
    substance: SubstanceRow;
    createdSubstance: boolean;
  }
  const createIntakes = db.transaction((): { row: IntakeRow; companions: CompanionCreated[] } => {
    const info = insertIntake.run(
      substance?.id ?? null, substanceName, takenAt, amount, notes, nowLocalISO(), null,
    );
    const mainRow = selectIntake.get(info.lastInsertRowid) as IntakeRow;

    const companions: CompanionCreated[] = [];
    if (d.companions === false) return { row: mainRow, companions };

    const seen = new Set([nameKey(substanceName)]);
    for (const comp of def.companions) {
      const key = nameKey(comp.name);
      if (seen.has(key)) continue; // Selbstbezug/Doppelnennung überspringen
      seen.add(key);
      const existedBefore = (db.prepare(`SELECT name FROM substances`).all() as { name: string }[])
        .some((s) => nameKey(s.name) === key);
      const compSub = findOrCreateSubstance(comp.name);
      const compDef = defaultsFor(compSub.name);
      const compAmount = normalizeAmount(comp.amount) || normalizeAmount(compSub.default_dose) || normalizeAmount(compDef.amount) || null;
      const compNotes = comp.note || compDef.note || null;
      const compInfo = insertIntake.run(
        compSub.id, compSub.name, takenAt, compAmount, compNotes, nowLocalISO(),
        `companion:${mainRow.id}`,
      );
      companions.push({
        row: selectIntake.get(compInfo.lastInsertRowid) as IntakeRow,
        substance: compSub,
        createdSubstance: !existedBefore,
      });
    }
    return { row: mainRow, companions };
  });
  const { row, companions } = createIntakes();

  // Erst wenn ALLE Nacht-Medis des aktuellen Plans für den Konsumtag
  // eingenommen wurden, wird das Tages-Assessment angeboten.
  const assessmentDate = allNightMedsTaken(consumptionDay(takenAt));
  const assessmentExists = assessmentDate
    ? !!db.prepare(`SELECT 1 FROM daily_assessments WHERE date = ?`).get(assessmentDate)
    : false;

  res.status(201).json({
    intake: serializeIntake(row),
    nightMed: assessmentDate !== null,
    assessmentDate,
    assessmentExists,
    createdSubstance,
    companions: companions.map((c) => ({
      intake: serializeIntake(c.row),
      createdSubstance: c.createdSubstance,
    })),
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
    amount: d.amount === undefined ? existing.amount : normalizeAmount(d.amount) || null,
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
