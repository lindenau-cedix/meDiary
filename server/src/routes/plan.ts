import { Router } from 'express';
import { z } from 'zod';
import {
  db,
  planVersionAt,
  planItemsFor,
  createPlanVersion,
  type PlanVersionRow,
  type NewPlanItem,
} from '../db.js';
import { dateOf, toLocalISO } from '../lib/time.js';
import { serializePlanVersion, type SerializedPlanItem } from '../lib/serialize.js';

export const planRouter = Router();

const COMPARE_FIELDS = ['strength', 'morning', 'noon', 'evening', 'night', 'unit', 'reason', 'notes'] as const;

function emptyPlan() {
  return { versionId: null, createdAt: null, note: null, items: [] as SerializedPlanItem[] };
}

function planPayloadAt(date: string | null) {
  const version = planVersionAt(date);
  if (!version) return emptyPlan();
  return serializePlanVersion(version, planItemsFor(version.id));
}

/** Aktueller Plan (neueste Version). */
planRouter.get('/', (_req, res) => {
  res.json(planPayloadAt(null));
});

/** Liste aller Versionen (Verlauf). */
planRouter.get('/versions', (_req, res) => {
  const versions = db
    .prepare(`SELECT * FROM plan_versions ORDER BY created_at DESC, id DESC`)
    .all() as PlanVersionRow[];
  const counts = db.prepare(`SELECT version_id AS v, COUNT(*) AS c FROM plan_items GROUP BY version_id`).all() as {
    v: number;
    c: number;
  }[];
  const countMap = new Map(counts.map((r) => [r.v, r.c]));
  res.json(
    versions.map((v) => ({
      versionId: v.id,
      createdAt: v.created_at,
      date: dateOf(v.created_at),
      note: v.note,
      itemCount: countMap.get(v.id) ?? 0,
    })),
  );
});

/** Plan zu einem Stichtag ("vor x Tagen"). ?date=YYYY-MM-DD oder ?days=N */
planRouter.get('/at', (req, res) => {
  let date: string | null = null;
  if (typeof req.query.date === 'string') {
    date = req.query.date.slice(0, 10);
  } else if (typeof req.query.days === 'string') {
    const d = new Date();
    d.setDate(d.getDate() - (Number(req.query.days) || 0));
    date = dateOf(toLocalISO(d));
  }
  res.json(planPayloadAt(date));
});

/** Bestimmte Version. */
planRouter.get('/version/:id', (req, res) => {
  const id = Number(req.params.id);
  const v = db.prepare(`SELECT * FROM plan_versions WHERE id = ?`).get(id) as PlanVersionRow | undefined;
  if (!v) return res.status(404).json({ error: 'Version nicht gefunden' });
  res.json(serializePlanVersion(v, planItemsFor(v.id)));
});

/**
 * Diff zwischen zwei Ständen.
 *   ?days=N            -> aktueller Plan vs. Plan vor N Tagen
 *   ?fromDate=&toDate= -> Plan an zwei Stichtagen
 * Abgleich erfolgt über den Substanznamen.
 */
planRouter.get('/diff', (req, res) => {
  let fromDate: string | null = null;
  let toDate: string | null = null;

  if (typeof req.query.days === 'string') {
    const d = new Date();
    d.setDate(d.getDate() - (Number(req.query.days) || 0));
    fromDate = dateOf(toLocalISO(d));
    toDate = null; // aktuell
  } else {
    fromDate = typeof req.query.fromDate === 'string' ? req.query.fromDate.slice(0, 10) : null;
    toDate = typeof req.query.toDate === 'string' ? req.query.toDate.slice(0, 10) : null;
  }

  const before = planPayloadAt(fromDate);
  const after = planPayloadAt(toDate);

  const key = (i: SerializedPlanItem) => i.substanceName.trim().toLowerCase();
  const beforeMap = new Map(before.items.map((i) => [key(i), i]));
  const afterMap = new Map(after.items.map((i) => [key(i), i]));

  const added: SerializedPlanItem[] = [];
  const removed: SerializedPlanItem[] = [];
  const changed: { substanceName: string; before: SerializedPlanItem; after: SerializedPlanItem; fields: string[] }[] = [];
  const unchanged: SerializedPlanItem[] = [];

  for (const [k, item] of afterMap) {
    const old = beforeMap.get(k);
    if (!old) {
      added.push(item);
    } else {
      const fields = COMPARE_FIELDS.filter((f) => (old[f] ?? null) !== (item[f] ?? null));
      if (fields.length) changed.push({ substanceName: item.substanceName, before: old, after: item, fields });
      else unchanged.push(item);
    }
  }
  for (const [k, item] of beforeMap) {
    if (!afterMap.has(k)) removed.push(item);
  }

  res.json({
    from: { versionId: before.versionId, createdAt: before.createdAt, date: fromDate },
    to: { versionId: after.versionId, createdAt: after.createdAt, date: toDate },
    added,
    removed,
    changed,
    unchanged,
    hasChanges: added.length + removed.length + changed.length > 0,
  });
});

const itemSchema = z.object({
  substanceId: z.number().int().nullish(),
  substanceName: z.string().trim().min(1),
  strength: z.string().trim().nullish(),
  morning: z.string().trim().nullish(),
  noon: z.string().trim().nullish(),
  evening: z.string().trim().nullish(),
  night: z.string().trim().nullish(),
  unit: z.string().trim().nullish(),
  reason: z.string().trim().nullish(),
  notes: z.string().trim().nullish(),
});

/** Neue Plan-Version speichern (vollständiger Snapshot). */
planRouter.put('/', (req, res) => {
  const parsed = z
    .object({ items: z.array(itemSchema), note: z.string().trim().nullish() })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const items: NewPlanItem[] = parsed.data.items.map((i) => ({
    substance_id: i.substanceId ?? null,
    substance_name: i.substanceName,
    strength: i.strength ?? null,
    morning: i.morning ?? null,
    noon: i.noon ?? null,
    evening: i.evening ?? null,
    night: i.night ?? null,
    unit: i.unit ?? null,
    reason: i.reason ?? null,
    notes: i.notes ?? null,
  }));

  const version = createPlanVersion(items, parsed.data.note ?? null);
  res.status(201).json(serializePlanVersion(version, planItemsFor(version.id)));
});
