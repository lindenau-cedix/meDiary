import { db, type SubstanceRow } from '../db.js';
import { nowLocalISO } from './time.js';

/**
 * Substanz-Verwaltung jenseits der reinen CRUD-Route: sorgt dafür, dass jede
 * Substanz, die jemals eingetragen wurde, als QuickPick (= Substanz-Kachel)
 * verfügbar ist.
 *
 * Zwei Wege führen dorthin:
 *  - `findOrCreateSubstance()` beim Anlegen einer Einnahme per Name → neue
 *    Namen werden sofort zur Kachel.
 *  - `backfillSubstancesFromIntakes()` beim Serverstart → bestehende
 *    (z. B. importierte) Einnahmen, deren Name noch keine Substanz hat,
 *    bekommen rückwirkend eine.
 */

// Markentreue Palette (synchron zu web/src/components/SubstanceManager.tsx).
const SWATCHES = [
  '#5B8DB8', '#8E6BB0', '#D98E48', '#7EA46B', '#C9A14A',
  '#9C5C8A', '#5FA8A0', '#B5727A', '#6E8C6A', '#C2705A',
];

/** Deterministische, gut gestreute Farbe anhand der bisherigen Anzahl. */
function nextColor(): string {
  const n = (db.prepare(`SELECT COUNT(*) AS c FROM substances`).get() as { c: number }).c;
  return SWATCHES[n % SWATCHES.length];
}

/** Legt eine neue (aktive) Substanz an und gibt die Zeile zurück. */
export function createSubstance(name: string): SubstanceRow {
  const maxOrder =
    (db.prepare(`SELECT MAX(sort_order) AS m FROM substances`).get() as { m: number | null }).m ?? 0;
  const info = db
    .prepare(
      `INSERT INTO substances (name, color, sort_order, created_at) VALUES (?, ?, ?, ?)`,
    )
    .run(name.trim(), nextColor(), maxOrder + 1, nowLocalISO());
  return db.prepare(`SELECT * FROM substances WHERE id = ?`).get(info.lastInsertRowid) as SubstanceRow;
}

/**
 * Findet eine Substanz per Name (case-insensitive) – aktive bevorzugt vor
 * archivierter – oder legt sie neu an. Eine archivierte Substanz wird bewusst
 * NICHT reaktiviert: so bleibt eine vom Nutzer entfernte Kachel entfernt.
 */
export function findOrCreateSubstance(name: string): SubstanceRow {
  const existing = db
    .prepare(
      `SELECT * FROM substances WHERE lower(name) = lower(?)
       ORDER BY (archived_at IS NULL) DESC, id LIMIT 1`,
    )
    .get(name.trim()) as SubstanceRow | undefined;
  return existing ?? createSubstance(name);
}

/**
 * Ergänzt für jeden Einnahme-Namen ohne zugehörige Substanz eine neue Substanz
 * und verknüpft die betroffenen Einnahmen (substance_id). Idempotent: Namen mit
 * bereits vorhandener (auch archivierter) Substanz werden übersprungen.
 */
export const backfillSubstancesFromIntakes = db.transaction((): { created: number; linked: number } => {
  // Distinkte Namen aus Einnahmen, zu denen es keine Substanz gibt (egal ob
  // aktiv oder archiviert). Ältester Eintrag bestimmt die Reihenfolge.
  const orphanNames = db
    .prepare(
      `SELECT i.substance_name AS name
         FROM intakes i
        WHERE NOT EXISTS (
                SELECT 1 FROM substances s WHERE lower(s.name) = lower(i.substance_name)
              )
        GROUP BY lower(i.substance_name)
        ORDER BY MIN(i.taken_at)`,
    )
    .all() as { name: string }[];

  const link = db.prepare(
    `UPDATE intakes SET substance_id = @id
      WHERE substance_id IS NULL AND lower(substance_name) = lower(@name)`,
  );

  let created = 0;
  let linked = 0;
  for (const { name } of orphanNames) {
    const sub = createSubstance(name);
    created++;
    linked += link.run({ id: sub.id, name }).changes;
  }
  return { created, linked };
});
