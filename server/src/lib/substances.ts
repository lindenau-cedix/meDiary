import { db, type SubstanceRow } from '../db.js';
import { nowLocalISO } from './time.js';
import { nameKey } from './names.js';

// Re-Export für Bestandscode (`import { nameKey } from '.../substances.js'`).
export { nameKey };

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
 * Findet eine Substanz per Name (case-insensitive, Unicode-aware) – aktive
 * bevorzugt vor archivierter – oder legt sie neu an. Eine archivierte Substanz
 * wird bewusst NICHT reaktiviert: so bleibt eine vom Nutzer entfernte Kachel
 * entfernt.
 */
export function findOrCreateSubstance(name: string): SubstanceRow {
  const trimmed = name.trim();
  const key = nameKey(trimmed);
  // JS-seitiger Scan, weil SQLite's `lower()` keine Umlaute faltet.
  const candidates = db
    .prepare(`SELECT * FROM substances ORDER BY id`)
    .all() as SubstanceRow[];
  const existing = candidates.find((s) => nameKey(s.name) === key);
  if (existing) return existing;
  return createSubstance(trimmed);
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

  // SQLite's `lower()` ist ASCII-only – wir koppeln intake→substance daher
  // in JS über `nameKey`, damit Umlaute (z. B. "CBD-Öl" == "cbd-öl") korrekt
  // zugeordnet werden.
  const orphanIntakes = db
    .prepare(
      `SELECT id, substance_name FROM intakes
        WHERE substance_id IS NULL
        ORDER BY id`,
    )
    .all() as { id: number; substance_name: string }[];
  const updateLink = db.prepare(`UPDATE intakes SET substance_id = ? WHERE id = ?`);

  let created = 0;
  let linked = 0;
  for (const { name } of orphanNames) {
    const sub = createSubstance(name);
    created++;
    const wanted = nameKey(name);
    for (const row of orphanIntakes) {
      if (nameKey(row.substance_name) !== wanted) continue;
      if (updateLink.run(sub.id, row.id).changes) linked++;
    }
  }
  return { created, linked };
});
