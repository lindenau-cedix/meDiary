/**
 * Demodaten für meDiary. Aufruf: `npm run seed` (überspringt, wenn schon
 * Substanzen existieren) bzw. `npm run seed -- --force` zum Neu-Aufsetzen.
 */
import { db } from './db.js';
import { nowLocalISO, toLocalISO } from './lib/time.js';
import { METRIC_KEYS } from './lib/metrics.js';

const force = process.argv.includes('--force');

const existing = (db.prepare(`SELECT COUNT(*) AS c FROM substances`).get() as { c: number }).c;
if (existing > 0 && !force) {
  console.log(`[seed] ${existing} Substanzen vorhanden – übersprungen. (--force zum Neuaufsetzen)`);
  process.exit(0);
}

if (force) {
  db.exec(`DELETE FROM intakes; DELETE FROM plan_items; DELETE FROM plan_versions;
           DELETE FROM daily_assessments; DELETE FROM substances;`);
  console.log('[seed] Bestehende Daten gelöscht (--force).');
}

function atDay(daysAgo: number, h = 12, m = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(h, m, 0, 0);
  return toLocalISO(d);
}
function dayStr(daysAgo: number): string {
  return atDay(daysAgo).slice(0, 10);
}

// ---------- Substanzen ----------
const subs: [string, { dose?: string; unit?: string; color: string; night?: boolean }][] = [
  ['Elvanse', { dose: '30 mg', unit: 'mg', color: '#D98E48' }],
  ['Lithium', { dose: '450 mg', unit: 'mg', color: '#5B8DB8' }],
  ['Quetiapin', { dose: '150 mg', unit: 'mg', color: '#8E6BB0', night: true }],
  ['Promethazin', { dose: '25 mg', unit: 'mg', color: '#9C5C8A', night: true }],
  ['Pantoprazol', { dose: '20 mg', unit: 'mg', color: '#C9A14A' }],
  ['Vitamin D', { dose: '2000 IE', unit: 'IE', color: '#7EA46B' }],
];

const insSub = db.prepare(
  `INSERT INTO substances (name, default_dose, unit, color, is_night_med, sort_order, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?)`,
);
const subIds: Record<string, number> = {};
subs.forEach(([name, o], i) => {
  const info = insSub.run(name, o.dose ?? null, o.unit ?? null, o.color, o.night ? 1 : 0, i, atDay(40));
  subIds[name] = Number(info.lastInsertRowid);
});
console.log(`[seed] ${subs.length} Substanzen angelegt.`);

// ---------- Medikationsplan (zwei Versionen für den Verlauf/Diff) ----------
function insertVersion(createdAt: string, note: string | null, items: any[]) {
  const v = db.prepare(`INSERT INTO plan_versions (created_at, note) VALUES (?, ?)`).run(createdAt, note);
  const vid = Number(v.lastInsertRowid);
  const ins = db.prepare(
    `INSERT INTO plan_items (version_id, substance_id, substance_name, strength, morning, noon, evening, night, unit, reason, notes, sort_order)
     VALUES (@version_id,@substance_id,@substance_name,@strength,@morning,@noon,@evening,@night,@unit,@reason,@notes,@sort_order)`,
  );
  items.forEach((it, i) =>
    ins.run({
      version_id: vid,
      substance_id: subIds[it.name] ?? null,
      substance_name: it.name,
      strength: it.strength ?? null,
      morning: it.morning ?? null,
      noon: it.noon ?? null,
      evening: it.evening ?? null,
      night: it.night ?? null,
      unit: it.unit ?? null,
      reason: it.reason ?? null,
      notes: it.notes ?? null,
      sort_order: i,
    }),
  );
}

// ältere Version (vor 24 Tagen): Quetiapin 100 mg, kein Vitamin D
insertVersion(atDay(24, 9, 0), 'Ersteinstellung', [
  { name: 'Elvanse', strength: '30 mg', morning: '1', unit: 'Kps.', reason: 'ADHS' },
  { name: 'Lithium', strength: '450 mg', morning: '1', night: '1', unit: 'Tbl.', reason: 'Phasenprophylaxe' },
  { name: 'Quetiapin', strength: '100 mg', night: '1', unit: 'Tbl.', reason: 'Schlaf / Stabilisierung' },
  { name: 'Pantoprazol', strength: '20 mg', morning: '1', unit: 'Tbl.', reason: 'Magenschutz' },
]);

// aktuelle Version (vor 5 Tagen): Quetiapin auf 150 mg erhöht, Vitamin D ergänzt
insertVersion(atDay(5, 20, 0), 'Quetiapin auf 150 mg erhöht, Vitamin D ergänzt', [
  { name: 'Elvanse', strength: '30 mg', morning: '1', unit: 'Kps.', reason: 'ADHS' },
  { name: 'Lithium', strength: '450 mg', morning: '1', night: '1', unit: 'Tbl.', reason: 'Phasenprophylaxe' },
  { name: 'Quetiapin', strength: '150 mg', night: '1', unit: 'Tbl.', reason: 'Schlaf / Stabilisierung' },
  { name: 'Pantoprazol', strength: '20 mg', morning: '1', unit: 'Tbl.', reason: 'Magenschutz' },
  { name: 'Vitamin D', strength: '2000 IE', morning: '1', unit: 'Tropfen', reason: 'Substitution' },
]);
console.log('[seed] 2 Medikationsplan-Versionen angelegt.');

// ---------- Einnahmen der letzten Tage ----------
const insIntake = db.prepare(
  `INSERT INTO intakes (substance_id, substance_name, taken_at, amount, notes, created_at)
   VALUES (?, ?, ?, ?, ?, ?)`,
);
function logIntake(name: string, daysAgo: number, h: number, m: number, amount: string, notes: string | null) {
  const at = atDay(daysAgo, h, m);
  insIntake.run(subIds[name] ?? null, name, at, amount, notes, at);
}
for (let d = 6; d >= 1; d--) {
  logIntake('Elvanse', d, 7, 30, '30 mg', null);
  logIntake('Lithium', d, 7, 35, '450 mg', null);
  logIntake('Pantoprazol', d, 7, 0, '20 mg', '30 Minuten vor dem Frühstück');
  logIntake('Vitamin D', d, 8, 0, '2000 IE', null);
  logIntake('Lithium', d, 22, 0, '450 mg', null);
  logIntake('Quetiapin', d, 22, 15, '150 mg', 'Zur Nacht.');
}
console.log('[seed] Einnahmen der letzten 6 Tage angelegt.');

// ---------- Tages-Assessments ----------
const insAssess = db.prepare(
  `INSERT INTO daily_assessments (date, scores, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
);
const curves: Record<string, number[]> = {
  sleep_quality: [4, 5, 6, 6, 7, 7],
  fatigue: [7, 6, 6, 5, 4, 4],
  stability: [5, 5, 6, 7, 7, 8],
  psychotic_load: [4, 3, 3, 2, 2, 2],
  functioning: [4, 5, 6, 6, 7, 7],
  mood: [4, 4, 5, 6, 6, 7],
  anxiety: [6, 5, 5, 4, 3, 3],
  drive: [3, 4, 5, 5, 6, 6],
  overstimulation: [6, 5, 5, 4, 4, 3],
  craving: [3, 3, 2, 2, 2, 1],
  pain: [3, 3, 2, 2, 2, 2],
};
for (let i = 0; i < 6; i++) {
  const daysAgo = 6 - i;
  const scores: Record<string, number> = {};
  for (const k of METRIC_KEYS) scores[k] = curves[k]?.[i] ?? 5;
  const at = atDay(daysAgo, 22, 30);
  insAssess.run(dayStr(daysAgo), JSON.stringify(scores), null, at, at);
}
console.log('[seed] Tages-Assessments der letzten 6 Tage angelegt.');

console.log(`[seed] Fertig um ${nowLocalISO()}.`);
