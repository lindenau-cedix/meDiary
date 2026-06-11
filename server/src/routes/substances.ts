import { Router } from 'express';
import { z } from 'zod';
import { db, type SubstanceRow } from '../db.js';
import { nowLocalISO } from '../lib/time.js';
import { serializeSubstance } from '../lib/serialize.js';

export const substancesRouter = Router();

/** Fügt zwischen Zahl und Buchstabe ein Leerzeichen ein: "100ml" → "100 ml" */
function normalizeAmount(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.replace(/(\d)([a-zA-ZäöüÄÖÜßµ])/g, '$1 $2');
}

const baseSchema = z.object({
  name: z.string().trim().min(1, 'Name erforderlich'),
  defaultDose: z.string().trim().nullish(),
  unit: z.string().trim().nullish(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Farbe muss Hex sein')
    .nullish(),
  isNightMed: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

substancesRouter.get('/', (req, res) => {
  const includeArchived = req.query.archived === 'true' || req.query.includeArchived === 'true';
  const rows = db
    .prepare(
      `SELECT * FROM substances ${includeArchived ? '' : 'WHERE archived_at IS NULL'}
       ORDER BY sort_order, name`,
    )
    .all() as SubstanceRow[];
  res.json(rows.map(serializeSubstance));
});

substancesRouter.post('/', (req, res) => {
  const parsed = baseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const d = parsed.data;
  const maxOrder =
    (db.prepare(`SELECT MAX(sort_order) AS m FROM substances`).get() as { m: number | null }).m ?? 0;
  const info = db
    .prepare(
      `INSERT INTO substances (name, default_dose, unit, color, is_night_med, sort_order, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      d.name,
      normalizeAmount(d.defaultDose) ?? null,
      d.unit ?? null,
      d.color ?? null,
      d.isNightMed ? 1 : 0,
      d.sortOrder ?? maxOrder + 1,
      nowLocalISO(),
    );
  const row = db.prepare(`SELECT * FROM substances WHERE id = ?`).get(info.lastInsertRowid) as SubstanceRow;
  res.status(201).json(serializeSubstance(row));
});

substancesRouter.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare(`SELECT * FROM substances WHERE id = ?`).get(id) as SubstanceRow | undefined;
  if (!existing) return res.status(404).json({ error: 'Substanz nicht gefunden' });

  const parsed = baseSchema.partial().extend({ archived: z.boolean().optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const d = parsed.data;

  db.prepare(
    `UPDATE substances SET
       name = COALESCE(@name, name),
       default_dose = COALESCE(@defaultDose, default_dose),
       unit = COALESCE(@unit, unit),
       color = COALESCE(@color, color),
       is_night_med = COALESCE(@isNightMed, is_night_med),
       sort_order = COALESCE(@sortOrder, sort_order),
       archived_at = @archivedAt
     WHERE id = @id`,
  ).run({
    id,
    name: d.name ?? null,
    defaultDose: d.defaultDose !== undefined ? normalizeAmount(d.defaultDose) ?? null : undefined,
    unit: d.unit ?? null,
    color: d.color ?? null,
    isNightMed: d.isNightMed === undefined ? null : d.isNightMed ? 1 : 0,
    sortOrder: d.sortOrder ?? null,
    archivedAt:
      d.archived === undefined
        ? existing.archived_at
        : d.archived
          ? (existing.archived_at ?? nowLocalISO())
          : null,
  });
  const row = db.prepare(`SELECT * FROM substances WHERE id = ?`).get(id) as SubstanceRow;
  res.json(serializeSubstance(row));
});

substancesRouter.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare(`SELECT * FROM substances WHERE id = ?`).get(id) as SubstanceRow | undefined;
  if (!existing) return res.status(404).json({ error: 'Substanz nicht gefunden' });

  if (req.query.hard === 'true') {
    db.prepare(`DELETE FROM substances WHERE id = ?`).run(id);
    return res.status(204).end();
  }
  // Soft-Delete (archivieren) – erhält die Historie der Einnahmen
  db.prepare(`UPDATE substances SET archived_at = ? WHERE id = ?`).run(nowLocalISO(), id);
  const row = db.prepare(`SELECT * FROM substances WHERE id = ?`).get(id) as SubstanceRow;
  res.json(serializeSubstance(row));
});

// Reihenfolge der Substanz-Kacheln festlegen
substancesRouter.post('/reorder', (req, res) => {
  const parsed = z.object({ ids: z.array(z.number().int()) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const update = db.prepare(`UPDATE substances SET sort_order = ? WHERE id = ?`);
  const tx = db.transaction((ids: number[]) => {
    ids.forEach((id, i) => update.run(i, id));
  });
  tx(parsed.data.ids);
  res.json({ ok: true });
});
