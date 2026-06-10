/**
 * Import der Daten aus dem `import/`-Ordner in die meDiary-Datenbank.
 *
 *   tsx src/import.ts                 # Dry-Run: zeigt nur, was passieren würde
 *   tsx src/import.ts --commit        # schreibt in die DB
 *   tsx src/import.ts --commit --reset-imported   # zuvor Importiertes ersetzen
 *
 * Quellen & Vorrang:
 *   medikations_akutverlauf.md      -> Akut-/Bedarfseinnahmen (PRIMÄR, sauber & getimt)
 *   medikationsplan_verlauf.md      -> versionierter Plan      (PRIMÄR)
 *   konsum_tagebuch_skalen.md       -> Tagesbilder (11 Skalen)
 *   entries.jsonl                   -> Lückenfüller: planmäßige Einnahmen sowie alle
 *                                      Ereignisse, die die Markdown-Logs NICHT abdecken
 *                                      (z. B. 06-09); Korrekturen.
 *
 * Die Markdown-Logs sind sauberer als entries.jsonl (exakte Uhrzeiten, klare Namen,
 * Korrekturen bereits eingearbeitet). Deshalb gewinnt bei Überschneidung Markdown:
 * ein jsonl-Eintrag wird übersprungen, wenn dieselbe (Tag, Uhrzeit) bzw. bei fehlender
 * Uhrzeit dasselbe (Tag, Substanz) bereits aus Markdown vorliegt.
 *
 * Idempotent über `source_event_id`; Dry-Run als Default.
 */
import fs from 'node:fs';
import path from 'node:path';
import { db } from './db.js';
import { config } from './config.js';
import { nowLocalISO } from './lib/time.js';
import { parseAkut, parsePlanVerlauf, extractSubstance, type MdIntake } from './lib/import_md.js';

const COMMIT = process.argv.includes('--commit');
const RESET = process.argv.includes('--reset-imported');
const IMPORT_DIR = process.env.IMPORT_DIR
  ? path.resolve(process.env.IMPORT_DIR)
  : path.join(path.dirname(config.defaultsPath), 'import');

const F = (name: string) => path.join(IMPORT_DIR, name);
const readIf = (name: string) => (fs.existsSync(F(name)) ? fs.readFileSync(F(name), 'utf8') : null);

// ---------- Helfer ----------

/** Substanz-Slug für (Tag, Substanz)-Deduplizierung über die Quellen hinweg. */
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9äöüß]+/gi, '').slice(0, 40);

/** Extrahiert lokale Wanduhrzeit "YYYY-MM-DDTHH:mm:ss" (TZ-Suffix wird ignoriert). */
function parseTimestamp(raw: unknown): { day: string; time: string | null } | null {
  if (!raw) return null;
  const m = String(raw).match(/(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (!m) return null;
  return { day: m[1], time: m[2] != null ? `${m[2]}:${m[3]}` : null };
}

/** Schneidet ein führendes „- **HH:MM CEST:**“ / „HH:MM — “ etc. vom Freitext ab. */
function stripLeadingTime(text: string): { time: string | null; rest: string } {
  let s = String(text).replace(/^[-*]\s*/, '').replace(/\*\*/g, '').trim();
  const m = s.match(/^(?:ca\.\s*)?(\d{1,2}:\d{2})(?:[\/–-]\s*\d{1,2}:\d{2})?\s*(?:CEST|CET|Uhr)?\s*[—:,-]?\s*/i);
  let time: string | null = null;
  if (m) { time = m[1].padStart(5, '0'); s = s.slice(m[0].length).trim(); }
  return { time, rest: s };
}

/** Tagessummen-/Kontextzeilen, die keine Einnahme sind. */
const SUMMARY_RE = /Tagesstand|Tagesrechnung|Tageskontext|Tagessumme|Zwischenstand|Arbeitsrechnung|Älterer|Nachtrag\/Wirkungsbeobachtung/i;
/** Klartext-Korrekturen/Klärungen, die als Einnahme fehlgeloggt wurden (keine Substanz). */
const JUNK_NAME_RE = /\b(muss|müsste|war doch|ist richtig|so ist|zweite[rs]? mal|stimmt|eigentlich|sorry|korrektur|nochmal|final timeline)\b/i;
/** Plausibler Substanzname: nicht zu viele Wörter, kein Korrektur-Satz. */
const isPlausibleName = (n: string) => n.length >= 2 && n.trim().split(/\s+/).length <= 6 && !JUNK_NAME_RE.test(n);

interface PlannedIntake { sourceId: string; name: string; takenAt: string; amount: string | null; notes: string | null }
interface PlannedVersion { sourceId: string; createdAt: string; note: string; items: any[] }

// ---------- 1) Markdown: Akut-Einnahmen (primär) ----------
const akutMd = readIf('medikations_akutverlauf.md');
const mdIntakesRaw: MdIntake[] = akutMd ? parseAkut(akutMd) : [];

// Markdown-Abdeckung (für jsonl-Dedup) + identische Einnahmen zusammenfassen.
const mdTimeSet = new Set<string>(); // `${day}|${HH:MM}`
const mdNameSet = new Set<string>(); // `${day}|${slug}`
const mdSeen = new Set<string>();
const idCount = new Map<string, number>();
const mdIntakesFinal: PlannedIntake[] = [];
for (const it of mdIntakesRaw) {
  const day = it.takenAt.slice(0, 10);
  mdTimeSet.add(`${day}|${it.takenAt.slice(11, 16)}`);
  mdNameSet.add(`${day}|${slug(it.name)}`);
  const dedupKey = `${it.takenAt}|${slug(it.name)}|${it.amount ?? ''}`;
  if (mdSeen.has(dedupKey)) continue; // exakt identische Zeile (Zeit/Name/Menge)
  mdSeen.add(dedupKey);
  const idBase = `md-akut:${it.takenAt}#${slug(it.name)}`;
  const n = idCount.get(idBase) ?? 0;
  idCount.set(idBase, n + 1);
  mdIntakesFinal.push({
    sourceId: n ? `${idBase}#${n}` : idBase,
    name: it.name,
    takenAt: it.takenAt,
    amount: it.amount,
    notes: it.notes,
  });
}

// ---------- 2) Markdown: Plan-Versionen (primär) ----------
const planMd = readIf('medikationsplan_verlauf.md');
const versions: PlannedVersion[] = (planMd ? parsePlanVerlauf(planMd) : []).map((v, i) => ({
  sourceId: `md-plan:${v.createdAt}#${i}`,
  createdAt: v.createdAt,
  note: v.note,
  items: v.items,
}));

// ---------- 3) entries.jsonl: Lückenfüller + Korrekturen ----------
const ENTRIES = F('entries.jsonl');
if (!fs.existsSync(ENTRIES) && !akutMd && !planMd) {
  console.error(`[import] Keine Quelldateien gefunden in ${IMPORT_DIR}`);
  console.error(`[import] IMPORT_DIR per Umgebungsvariable überschreibbar.`);
  process.exit(1);
}

const records: any[] = fs.existsSync(ENTRIES)
  ? fs
      .readFileSync(ENTRIES, 'utf8')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l, i) => {
        try { return JSON.parse(l); } catch { console.warn(`[import] entries.jsonl Zeile ${i + 1}: ungültiges JSON, übersprungen`); return null; }
      })
      .filter(Boolean)
  : [];

const INTAKE_TYPES = new Set(['acute_intake', 'planned_intake', 'acute']);
const gapIntakes: PlannedIntake[] = [];
const gapSeen = new Set<string>(); // (Zeit|Name|Menge) gegen jsonl-interne Doppelungen
const corrections: { correctsId: string; text: string }[] = [];
const skipped: Record<string, number> = {};
let coveredByMd = 0;
let summarySkipped = 0;

for (const r of records) {
  const type = r.event_type ?? r.type ?? 'unknown';

  if (INTAKE_TYPES.has(type)) {
    const ts = parseTimestamp(r.timestamp ?? r.ts);
    const day = r.consumption_day || ts?.day;
    if (!day) { skipped['ohne Datum'] = (skipped['ohne Datum'] ?? 0) + 1; continue; }
    const source: string = r.source_message ?? r.source_text ?? '';
    if (SUMMARY_RE.test(source)) { summarySkipped++; continue; }

    const { time: textTime, rest } = stripLeadingTime(source);
    const time = ts?.time ?? textTime;

    // Expansion „… [als/aus] 45 mg Mirtazapin + 15 mg Aripiprazol“ bzw. „3ml Extrakt + Nachtmedis“.
    const isNight = /Nachtmedi/i.test(rest);
    const isMorning = /Morgenmedi|Morgendmedi/i.test(rest);
    const exp = rest.match(/\b(?:als|aus)\b(.*)$/i);
    const fallback = isNight ? '22:00' : isMorning ? '08:00' : '12:00';
    const takenAt = `${day}T${time ?? fallback}:00`;

    const parts: { name: string; amount: string | null }[] = [];
    if ((isNight || isMorning) && /\+/.test(rest)) {
      for (const p of (exp ? exp[1] : rest).split('+')) {
        const c = p.replace(/\(.*?\)/g, '').trim();
        if (!c) continue;
        if (/Nachtmedi/i.test(c)) parts.push({ name: 'Nachtmedikation', amount: null });
        else if (/Morgenmedi|Morgendmedi/i.test(c)) parts.push({ name: 'Morgenmedikation', amount: null });
        else { const e = extractSubstance(c); if (isPlausibleName(e.name)) parts.push(e); }
      }
    }
    if (!parts.length) {
      if (isNight) parts.push({ name: 'Nachtmedikation', amount: null });
      else if (isMorning) parts.push({ name: 'Morgenmedikation', amount: null });
      else { const e = extractSubstance(rest || source); if (isPlausibleName(e.name)) parts.push(e); }
    }

    let idx = 0;
    let anyKept = false;
    for (const p of parts) {
      // Abdeckung durch Markdown prüfen (sauberere Variante gewinnt)
      const covered = time ? mdTimeSet.has(`${day}|${time}`) : mdNameSet.has(`${day}|${slug(p.name)}`);
      if (covered) { coveredByMd++; continue; }
      const dedupKey = `${takenAt}|${slug(p.name)}|${p.amount ?? ''}`;
      if (gapSeen.has(dedupKey)) { anyKept = true; continue; } // jsonl-interne Doppelung
      gapSeen.add(dedupKey);
      anyKept = true;
      const sourceId = parts.length > 1 ? `${r.event_id}#${idx}` : String(r.event_id);
      gapIntakes.push({ sourceId, name: p.name, takenAt, amount: p.amount, notes: source || null });
      idx++;
    }
    if (!anyKept) { if (!parts.length) skipped['unklar (kein Substanzname)'] = (skipped['unklar (kein Substanzname)'] ?? 0) + 1; continue; }
  } else if (type === 'correction') {
    const correctsId = r.corrects_event_id ?? r.correction_of ?? null;
    const text = r.classification_reason || (Array.isArray(r.substances) && r.substances[0]?.description) || r.source_message;
    if (correctsId && text) corrections.push({ correctsId: String(correctsId), text: String(text) });
    else skipped['correction (ohne Ziel)'] = (skipped['correction (ohne Ziel)'] ?? 0) + 1;
  } else {
    skipped[type] = (skipped[type] ?? 0) + 1;
  }
}

// ---------- 4) Skalen -> Tagesbilder (Reihenfolge exakt aus konsum_tagebuch_skalen.md) ----------
const SCALE_KEYS = [
  'sleep_quality', 'fatigue', 'stability', 'psychotic_load', 'mood',
  'functioning', 'anxiety', 'craving', 'overstimulation', 'sedation', 'pain',
];
const assessments: { date: string; scores: Record<string, number> }[] = [];
let scaleSkipped = 0;
const scalesMd = readIf('konsum_tagebuch_skalen.md');
if (scalesMd) {
  for (const line of scalesMd.split(/\r?\n/)) {
    const m = line.match(/^(\d{4}-\d{2}-\d{2})\s*\|\s*(.+)$/);
    if (!m) continue;
    const vals = m[2].split('|').map((v) => Number(v.trim()));
    // Vollständige (11) oder bis auf Schmerz vollständige (10) Zeilen akzeptieren.
    if ((vals.length !== 11 && vals.length !== 10) || vals.some((v) => !Number.isFinite(v))) { scaleSkipped++; continue; }
    const scores: Record<string, number> = {};
    SCALE_KEYS.forEach((k, i) => { if (i < vals.length && vals[i] >= 1 && vals[i] <= 10) scores[k] = vals[i]; });
    if (Object.keys(scores).length >= 8) assessments.push({ date: m[1], scores });
    else scaleSkipped++;
  }
}

// ---------- Bereits importierte IDs (Idempotenz) ----------
const existingIntakeIds = new Set(
  (db.prepare(`SELECT source_event_id AS s FROM intakes WHERE source_event_id IS NOT NULL`).all() as { s: string }[]).map((r) => r.s),
);
const existingPlanIds = new Set(
  (db.prepare(`SELECT source_event_id AS s FROM plan_versions WHERE source_event_id IS NOT NULL`).all() as { s: string }[]).map((r) => r.s),
);
const allIntakes = [...mdIntakesFinal, ...gapIntakes];
const newIntakes = RESET ? allIntakes : allIntakes.filter((it) => !existingIntakeIds.has(it.sourceId));
const newVersions = RESET ? versions : versions.filter((v) => !existingPlanIds.has(v.sourceId));
const dupIntakes = allIntakes.length - newIntakes.length;
const dupVersions = versions.length - newVersions.length;

// ---------- Ausgabe ----------
console.log(`\n[import] Quelle: ${IMPORT_DIR}`);
console.log(`[import] Modus:  ${COMMIT ? 'COMMIT (schreibt)' : 'DRY-RUN (keine Änderungen)'}${RESET ? ' + RESET' : ''}\n`);
console.log(`  Einnahmen gesamt : ${newIntakes.length} neu` + (dupIntakes ? `, ${dupIntakes} bereits importiert` : ''));
console.log(`    • aus Markdown (Akutverlauf): ${mdIntakesFinal.length}`);
console.log(`    • Lückenfüller aus entries.jsonl: ${gapIntakes.length}  (${coveredByMd} durch Markdown abgedeckt → übersprungen)`);
console.log(`  Plan-Versionen   : ${newVersions.length} neu` + (dupVersions ? `, ${dupVersions} bereits importiert` : '') + `  (aus medikationsplan_verlauf.md)`);
console.log(`  Korrekturen      : ${corrections.length} (werden an passende jsonl-Einnahmen angehängt)`);
console.log(`  Tagesbilder      : ${assessments.length}` + (scaleSkipped ? `, ${scaleSkipped} Skalen-Zeilen übersprungen` : ''));
if (summarySkipped) console.log(`  Tagessummen/Kontext übersprungen: ${summarySkipped}`);
if (Object.keys(skipped).length) console.log(`  sonstige übersprungen: ${JSON.stringify(skipped)}`);

console.log('\n  Beispiele Einnahmen (Markdown):');
for (const it of mdIntakesFinal.slice(0, 6)) console.log(`    ${it.takenAt}  ${it.name}${it.amount ? '  [' + it.amount + ']' : ''}`);
console.log('  Beispiele Lückenfüller (jsonl):');
for (const it of gapIntakes.slice(0, 6)) console.log(`    ${it.takenAt}  ${it.name}${it.amount ? '  [' + it.amount + ']' : ''}`);
console.log('  Plan-Versionen:');
for (const v of versions) console.log(`    ${v.createdAt.slice(0, 16)}  „${v.note.slice(0, 56)}"  (${v.items.length} Items)`);

if (!COMMIT) {
  console.log('\n[import] Dry-Run beendet. Mit  --commit  tatsächlich schreiben.\n');
  process.exit(0);
}

// ---------- Schreiben ----------
const now = nowLocalISO();
const writeAll = db.transaction(() => {
  if (RESET) {
    db.prepare(`DELETE FROM plan_items WHERE version_id IN (SELECT id FROM plan_versions WHERE source_event_id IS NOT NULL)`).run();
    const dv = db.prepare(`DELETE FROM plan_versions WHERE source_event_id IS NOT NULL`).run();
    const di = db.prepare(`DELETE FROM intakes WHERE source_event_id IS NOT NULL`).run();
    console.log(`[import] RESET: ${di.changes} Einnahmen, ${dv.changes} Plan-Versionen entfernt`);
  }

  const insIntake = db.prepare(
    `INSERT INTO intakes (substance_id, substance_name, taken_at, amount, notes, created_at, source_event_id)
     VALUES (NULL, @name, @takenAt, @amount, @notes, @createdAt, @sourceId)`,
  );
  const idByEvent = new Map<string, number[]>();
  for (const it of newIntakes) {
    const info = insIntake.run({ ...it, createdAt: now });
    const base = it.sourceId.split('#')[0];
    const arr = idByEvent.get(base) ?? [];
    arr.push(Number(info.lastInsertRowid));
    idByEvent.set(base, arr);
  }

  const insVersion = db.prepare(`INSERT INTO plan_versions (created_at, note, source_event_id) VALUES (?, ?, ?)`);
  const insItem = db.prepare(
    `INSERT INTO plan_items (version_id, substance_id, substance_name, strength, morning, noon, evening, night, unit, reason, notes, sort_order)
     VALUES (@vid, NULL, @substanceName, @strength, @morning, @noon, @evening, @night, NULL, NULL, @notes, @sort)`,
  );
  for (const v of newVersions) {
    const info = insVersion.run(v.createdAt, v.note, v.sourceId);
    const vid = Number(info.lastInsertRowid);
    v.items.forEach((it: any, i: number) =>
      insItem.run({ vid, sort: i, substanceName: it.substanceName, strength: it.strength ?? null, morning: it.morning ?? null, noon: it.noon ?? null, evening: it.evening ?? null, night: it.night ?? null, notes: it.notes ?? null }),
    );
  }

  // Korrekturen an passende (jsonl-)Einnahmen anhängen (ohne Doppelung)
  let applied = 0;
  const getNotes = db.prepare(`SELECT id, notes FROM intakes WHERE id = ?`);
  const updNotes = db.prepare(`UPDATE intakes SET notes = ? WHERE id = ?`);
  for (const corr of corrections) {
    for (const id of idByEvent.get(corr.correctsId) ?? []) {
      const row = getNotes.get(id) as { notes: string | null };
      const marker = `[Korrektur] ${corr.text}`;
      if (row.notes?.includes(marker)) continue;
      updNotes.run(`${row.notes ? row.notes + '\n' : ''}${marker}`, id);
      applied++;
    }
  }

  const insAssess = db.prepare(
    `INSERT INTO daily_assessments (date, scores, note, created_at, updated_at)
     VALUES (@date, @scores, NULL, @now, @now)
     ON CONFLICT(date) DO UPDATE SET scores = @scores, updated_at = @now`,
  );
  for (const a of assessments) insAssess.run({ date: a.date, scores: JSON.stringify(a.scores), now });

  console.log(`[import] geschrieben: ${newIntakes.length} Einnahmen, ${newVersions.length} Plan-Versionen, ${applied} Korrekturen, ${assessments.length} Tagesbilder`);
});

writeAll();
console.log('[import] Fertig.\n');
process.exit(0);
