import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from './config.js';
import { dateOf, nowLocalISO, toLocalISO } from './lib/time.js';
import { nameKey } from './lib/names.js';

// Datenverzeichnis sicherstellen
fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

export const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS substances (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  default_dose  TEXT,
  unit          TEXT,
  color         TEXT,
  is_night_med  INTEGER NOT NULL DEFAULT 0,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  archived_at   TEXT,
  created_at    TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS intakes (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  substance_id   INTEGER,
  substance_name TEXT    NOT NULL,
  taken_at       TEXT    NOT NULL,
  amount         TEXT,
  notes          TEXT,
  created_at     TEXT    NOT NULL,
  FOREIGN KEY (substance_id) REFERENCES substances(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_intakes_taken_at ON intakes(taken_at);

CREATE TABLE IF NOT EXISTS plan_versions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT    NOT NULL,
  note       TEXT
);

CREATE TABLE IF NOT EXISTS plan_items (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  version_id     INTEGER NOT NULL,
  substance_id   INTEGER,
  substance_name TEXT    NOT NULL,
  strength       TEXT,
  morning        TEXT,
  noon           TEXT,
  evening        TEXT,
  night          TEXT,
  unit           TEXT,
  reason         TEXT,
  notes          TEXT,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (version_id) REFERENCES plan_versions(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_plan_items_version ON plan_items(version_id);

CREATE TABLE IF NOT EXISTS daily_assessments (
  date       TEXT PRIMARY KEY,
  scores     TEXT NOT NULL,
  note       TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_habits (
  date           TEXT PRIMARY KEY,
  wake_first_unix REAL,
  wake_last_unix  REAL,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

-- Nächtliches "Träumen": die tägliche KI-Auswertung (system_prompt.md -> MiniMax M3).
-- Pro Konsum-Tag genau EIN Traum (date als PRIMARY KEY = UNIQUE-Constraint, der
-- die Idempotenz des Schedulers absichert). content ist der vollständige
-- Auswertungstext, model das verwendete Modell, status 'ok' (Erfolg).
CREATE TABLE IF NOT EXISTS dreams (
  date       TEXT PRIMARY KEY,
  content    TEXT NOT NULL,
  model      TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'ok',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dreams_date ON dreams(date);

-- Daten-Konsole („Chat with your data"): Audit-Log & Undo für die per
-- Natürlichsprache vorgeschlagenen Massen-Operationen. Jede Zeile ist EIN
-- Change-Set (Stapel typisierter Operationen). Nichts wird angewandt, solange
-- status='proposed'; beim Bestätigen werden alle Operationen in EINER
-- Transaktion ausgeführt, ein Vorzustands-Snapshot (undo_snapshot) gespeichert
-- und status='applied' gesetzt. „Undo" stellt aus dem Snapshot wieder her.
--   prompt        die auslösende Natürlichsprache-Anweisung (Audit)
--   title/summary kurze Beschreibung (vom Modell)
--   operations    JSON-Array der typisierten, validierten Operationen
--   preview       JSON des Dry-Runs (betroffene Zeilen + before→after-Sample)
--   undo_snapshot JSON der Vorzustands-Zeilen (erst bei status='applied')
--   affected      Anzahl betroffener Zeilen (zum Anzeigen/Schwelle)
CREATE TABLE IF NOT EXISTS chat_change_sets (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at    TEXT    NOT NULL,
  applied_at    TEXT,
  undone_at     TEXT,
  status        TEXT    NOT NULL DEFAULT 'proposed',
  prompt        TEXT    NOT NULL,
  title         TEXT    NOT NULL,
  summary       TEXT,
  operations    TEXT    NOT NULL,
  preview       TEXT,
  undo_snapshot TEXT,
  affected      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_chat_change_sets_status ON chat_change_sets(status);

-- Tagesbericht des Hermes-Agents (was der Agent an diesem Konsum-Tag getan hat).
-- Wird vom 03:30-Berlin-Cron per POST /api/report/new eingeliefert und fließt in
-- den Traum-Kontext (gatherDreamContext) ein, damit das naechtliche Traeumen
-- nicht nur 1-10-Skalen + Notizen, sondern auch die Agent-Aktivitaeten des Tages
-- kennt. Pro Konsum-Tag genau EIN Bericht (date = PK -> idempotente UPSERT).
--   report      Freitext (Markdown oder Plain) - was der Agent an diesem Tag
--               gemacht hat (Coding-Sessions, Cron-Laeufe, Deploys, Fehler ...)
--   source      optionaler Marker, wer den Bericht eingeliefert hat
--               (z. B. "hermes-cron-0330" - hilft beim Debugging)
CREATE TABLE IF NOT EXISTS daily_reports (
  date       TEXT PRIMARY KEY,
  report     TEXT NOT NULL,
  source     TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`);

// Migration: Schemaumbenennung der Habit-Spalten von "PC-Nutzung" auf
// "Wachzeit". SQLite kennt `RENAME COLUMN` seit 3.25.0; wir versuchen es
// idempotent, mit Fallback für ältere Versionen. Betroffen:
//   pc_first_interaction_unix → wake_first_unix
//   pc_last_interaction_unix  → wake_last_unix
const habitCols = db.prepare(`PRAGMA table_info(daily_habits)`).all() as { name: string }[];
const habitColNames = new Set(habitCols.map((c) => c.name));
const renameHabitCol = (from: string, to: string) => {
  if (!habitColNames.has(from) || habitColNames.has(to)) return;
  try {
    db.exec(`ALTER TABLE daily_habits RENAME COLUMN ${from} TO ${to}`);
  } catch {
    // Sehr alte SQLite-Version (< 3.25) ohne RENAME COLUMN: neue Tabelle
    // anlegen, Daten kopieren, alte löschen, umbenennen. Idempotent.
    db.exec(`
      CREATE TABLE IF NOT EXISTS daily_habits__new (
        date           TEXT PRIMARY KEY,
        wake_first_unix REAL,
        wake_last_unix  REAL,
        created_at     TEXT NOT NULL,
        updated_at     TEXT NOT NULL
      );
      INSERT INTO daily_habits__new (date, wake_first_unix, wake_last_unix, created_at, updated_at)
        SELECT date, ${from} AS wake_first_unix, NULL AS wake_last_unix, created_at, updated_at
        FROM daily_habits;
      DROP TABLE daily_habits;
      ALTER TABLE daily_habits__new RENAME TO daily_habits;
    `);
  }
};
renameHabitCol('pc_first_interaction_unix', 'wake_first_unix');
renameHabitCol('pc_last_interaction_unix', 'wake_last_unix');

// Migration: Spalte für Import-Idempotenz (verknüpft Zeilen mit import event_id)
function ensureColumn(table: string, column: string, type: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}
ensureColumn('intakes', 'source_event_id', 'TEXT');
ensureColumn('plan_versions', 'source_event_id', 'TEXT');
db.exec(`CREATE INDEX IF NOT EXISTS idx_intakes_source ON intakes(source_event_id);
         CREATE INDEX IF NOT EXISTS idx_plan_versions_source ON plan_versions(source_event_id);`);

// Migration: Wirkungsdatum einer Plan-Version ("gültig ab", YYYY-MM-DD).
// Erlaubt rückwirkende und zukünftige Plan-Änderungen unabhängig vom
// Erfassungszeitpunkt. Bestehende Versionen: Wirkungsdatum = Erfassungstag.
ensureColumn('plan_versions', 'effective_from', 'TEXT');
db.exec(`UPDATE plan_versions SET effective_from = substr(created_at, 1, 10) WHERE effective_from IS NULL;
         CREATE INDEX IF NOT EXISTS idx_plan_versions_effective ON plan_versions(effective_from);`);

// ---------- Typen ----------

export interface SubstanceRow {
  id: number;
  name: string;
  default_dose: string | null;
  unit: string | null;
  color: string | null;
  is_night_med: number;
  sort_order: number;
  archived_at: string | null;
  created_at: string;
}

export interface IntakeRow {
  id: number;
  substance_id: number | null;
  substance_name: string;
  taken_at: string;
  amount: string | null;
  notes: string | null;
  created_at: string;
  /** Batch-/Herkunftsmarker (Import, Begleitsubstanz, Konsole) — per Migration ergänzt. */
  source_event_id: string | null;
}

export interface PlanVersionRow {
  id: number;
  created_at: string;
  effective_from: string;
  note: string | null;
}

export interface PlanItemRow {
  id: number;
  version_id: number;
  substance_id: number | null;
  substance_name: string;
  strength: string | null;
  morning: string | null;
  noon: string | null;
  evening: string | null;
  night: string | null;
  unit: string | null;
  reason: string | null;
  notes: string | null;
  sort_order: number;
}

export interface AssessmentRow {
  date: string;
  scores: string;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface HabitRow {
  date: string;
  /** Erster Wachzeit-Punkt des Tages (Unix-Sek): Aufwachen, früheste Einnahme des Tages
   *  oder `first_user_interaction_24h_unix` aus dem Webhook — siehe `routes/habit.ts`. */
  wake_first_unix: number | null;
  /** Letzter Wachzeit-Punkt des Tages (Unix-Sek): letzte Einnahme oder `last_user_interaction_unix`. */
  wake_last_unix: number | null;
  created_at: string;
  updated_at: string;
}

export interface DreamRow {
  date: string;
  content: string;
  model: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface DailyReportRow {
  date: string;
  report: string;
  source: string | null;
  created_at: string;
  updated_at: string;
}

export type ChatChangeSetStatus = 'proposed' | 'applied' | 'undone' | 'discarded';

export interface ChatChangeSetRow {
  id: number;
  created_at: string;
  applied_at: string | null;
  undone_at: string | null;
  status: ChatChangeSetStatus;
  prompt: string;
  title: string;
  summary: string | null;
  /** JSON-Array der typisierten Operationen (siehe lib/chat_tools.ts). */
  operations: string;
  /** JSON des Dry-Run-Previews (betroffene Zeilen + before→after-Sample). */
  preview: string | null;
  /** JSON der Vorzustands-Zeilen für „Undo" (erst bei status='applied'). */
  undo_snapshot: string | null;
  affected: number;
}

// ---------- Traum-Helfer ----------

/** Traum eines Konsum-Tages (oder null). */
export function dreamFor(date: string): DreamRow | null {
  return (db.prepare(`SELECT * FROM dreams WHERE date = ?`).get(date) as DreamRow | undefined) ?? null;
}

/** Jüngster Traum (höchstes Datum), oder null. */
export function latestDream(): DreamRow | null {
  return (
    (db.prepare(`SELECT * FROM dreams ORDER BY date DESC LIMIT 1`).get() as DreamRow | undefined) ?? null
  );
}

/** Träume in einem Datumsbereich (neueste zuerst). `from`/`to` optional (YYYY-MM-DD). */
export function listDreams(opts?: { from?: string; to?: string; limit?: number }): DreamRow[] {
  const where: string[] = [];
  const params: Record<string, unknown> = {};
  if (opts?.from) {
    where.push(`date >= @from`);
    params.from = opts.from.slice(0, 10);
  }
  if (opts?.to) {
    where.push(`date <= @to`);
    params.to = opts.to.slice(0, 10);
  }
  let sql = `SELECT * FROM dreams ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY date DESC`;
  if (opts?.limit && opts.limit > 0) sql += ` LIMIT ${Math.floor(opts.limit)}`;
  return db.prepare(sql).all(params) as DreamRow[];
}

/** Die `n` jüngsten Träume STRIKT VOR `beforeDate` (für „Träume der letzten 7 Tage"). */
export function dreamsBefore(beforeDate: string, n: number): DreamRow[] {
  return db
    .prepare(`SELECT * FROM dreams WHERE date < ? ORDER BY date DESC LIMIT ?`)
    .all(beforeDate, Math.max(0, Math.floor(n))) as DreamRow[];
}

/** Traum anlegen/überschreiben (idempotent pro Konsum-Tag). */
export function upsertDream(date: string, content: string, model: string, status = 'ok'): DreamRow {
  const now = nowLocalISO();
  db.prepare(
    `INSERT INTO dreams (date, content, model, status, created_at, updated_at)
     VALUES (@date, @content, @model, @status, @now, @now)
     ON CONFLICT(date) DO UPDATE SET
       content = @content, model = @model, status = @status, updated_at = @now`,
  ).run({ date, content, model, status, now });
  return dreamFor(date)!;
}

/** Traum löschen. Gibt true zurück, wenn etwas gelöscht wurde. */
export function deleteDream(date: string): boolean {
  return db.prepare(`DELETE FROM dreams WHERE date = ?`).run(date).changes > 0;
}

// ---------- Tagesbericht (Hermes-Agent) — Helfer ----------

/** Tagesbericht für ein Datum (oder null). */
export function reportFor(date: string): DailyReportRow | null {
  return (
    (db.prepare(`SELECT * FROM daily_reports WHERE date = ?`).get(date) as DailyReportRow | undefined) ?? null
  );
}

/** Tagesberichte in einem Datumsbereich (neueste zuerst). `from`/`to` optional. */
export function listReports(opts?: { from?: string; to?: string; limit?: number }): DailyReportRow[] {
  const where: string[] = [];
  const params: Record<string, unknown> = {};
  if (opts?.from) {
    where.push(`date >= @from`);
    params.from = opts.from.slice(0, 10);
  }
  if (opts?.to) {
    where.push(`date <= @to`);
    params.to = opts.to.slice(0, 10);
  }
  let sql = `SELECT * FROM daily_reports ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY date DESC`;
  if (opts?.limit && opts.limit > 0) sql += ` LIMIT ${Math.floor(opts.limit)}`;
  return db.prepare(sql).all(params) as DailyReportRow[];
}

/**
 * Die `n` jüngsten Berichte STRIKT VOR `beforeDate` (für „Berichte der letzten
 * 7 Tage" im Traum-Kontext). Liefert die Reports in absteigender Datums-Reihenfolge.
 */
export function reportsBefore(beforeDate: string, n: number): DailyReportRow[] {
  return db
    .prepare(`SELECT * FROM daily_reports WHERE date < ? ORDER BY date DESC LIMIT ?`)
    .all(beforeDate, Math.max(0, Math.floor(n))) as DailyReportRow[];
}

/**
 * Tagesbericht anlegen/überschreiben (idempotent pro Konsum-Tag).
 * `report` muss ein nicht-leerer String sein; `source` ist optional und dient
 * der Nachvollziehbarkeit (z. B. "hermes-cron-0330").
 */
export function upsertReport(date: string, report: string, source: string | null): DailyReportRow {
  const now = nowLocalISO();
  db.prepare(
    `INSERT INTO daily_reports (date, report, source, created_at, updated_at)
     VALUES (@date, @report, @source, @now, @now)
     ON CONFLICT(date) DO UPDATE SET
       report = @report,
       source = @source,
       updated_at = @now`,
  ).run({ date, report, source, now });
  return reportFor(date)!;
}

/** Tagesbericht löschen. Gibt true zurück, wenn etwas gelöscht wurde. */
export function deleteReport(date: string): boolean {
  return db.prepare(`DELETE FROM daily_reports WHERE date = ?`).run(date).changes > 0;
}

// ---------- Plan-Helfer ----------

/**
 * Liefert die zum Stichtag/Zeitpunkt aktive Plan-Version (oder null).
 * Maßgeblich ist `effective_from` ("YYYY-MM-DD" oder "YYYY-MM-DDTHH:mm");
 * ein reines Datum gilt ab 00:00, der String-Vergleich ordnet beide Formate
 * korrekt. `at = null` bedeutet "jetzt"; ein reines Datum als Stichtag wird
 * als Tagesende interpretiert ("welcher Plan galt an diesem Tag").
 */
export function planVersionAt(at: string | null): PlanVersionRow | null {
  const moment = at == null ? nowLocalISO() : at.length === 10 ? `${at}T23:59:59` : at;
  return (
    (db
      .prepare(
        `SELECT * FROM plan_versions WHERE effective_from <= ? ORDER BY effective_from DESC, id DESC LIMIT 1`,
      )
      .get(moment) as PlanVersionRow | undefined) ?? null
  );
}

/** Versionen, deren Wirkungszeitpunkt noch in der Zukunft liegt (früheste zuerst). */
export function upcomingPlanVersions(): PlanVersionRow[] {
  const now = nowLocalISO();
  return db
    .prepare(`SELECT * FROM plan_versions WHERE effective_from > ? ORDER BY effective_from ASC, id ASC`)
    .all(now) as PlanVersionRow[];
}

export function planItemsFor(versionId: number): PlanItemRow[] {
  return db
    .prepare(`SELECT * FROM plan_items WHERE version_id = ? ORDER BY sort_order, id`)
    .all(versionId) as PlanItemRow[];
}

/**
 * Alle今夜-Medis-Namen aus dem am gegebenen Tag wirksamen Plan.
 * Ein Plan hat genau die Substanzen, die in plan_items stehen.
 * Ein Intake zählt als „genommen", wenn substance_id oder substance_name
 * (nach Normalisierung über nameKey) übereinstimmt.
 */
export function nightMedicationsFromPlan(day: string): string[] {
  const version = planVersionAt(day);
  if (!version) return [];
  const items = planItemsFor(version.id);
  return items
    .filter((item) => item.night != null)
    .map((item) => item.substance_name);
}

/**
 * Prüft, ob ALLE今夜-Medis des am gegebenen Tag wirksamen Plans
 * heute bereits eingenommen wurden. Gibt den Tagesbild-Konsumtag zurück,
 * wenn ja, sonst null.
 */
export function allNightMedsTaken(day: string): string | null {
  const planned = nightMedicationsFromPlan(day);
  if (planned.length === 0) return null;

  // Einnahmen an diesem Konsumtag (mit Tagesgrenzen-Berücksichtigung):
  // zum Konsumtag `day` zählen alle Einnahmen im Wand­uhr-Bereich
  // dayT03:30:00 (inklusive)  bis  (day+1)T03:29:59 (inklusive) —
  // d. h. `consumptionDay(takenAt) === day` für alle `takenAt` in
  // diesem Intervall. Beispiel: Konsumtag 2026-06-15 → Einnahmen
  // 2026-06-15T03:30 bis 2026-06-16T03:29:59 (lokale Wand­uhrzeit).
  const next = new Date(`${day}T12:00:00`);
  next.setDate(next.getDate() + 1);
  const nextStr = toLocalISO(next).slice(0, 10);
  const start = `${day}T03:30:00`;
  const end = `${nextStr}T03:29:59`;
  const taken = db
    .prepare(
      `SELECT substance_id, substance_name FROM intakes
       WHERE taken_at >= ? AND taken_at <= ?`,
    )
    .all(start, end) as { substance_id: number | null; substance_name: string }[];

  // Substanz-IDs mit今夜-Med-Flag für今天的 Plan (normalisierte Namen)
  const plannedLower = new Set(planned.map((n) => nameKey(n)));

  // Eine Einnahme gilt als今夜-Med, wenn:
  //   - substance_id auf eine Substanz mit is_night_med=1 zeigt, ODER
  //   - substance_name nach nameKey-Normalisierung in plannedLower liegt
  const nightMedIds = new Set<number>();
  for (const item of planned) {
    const row = db
      .prepare(`SELECT id FROM substances WHERE name = ?`)
      .get(item) as { id: number } | undefined;
    if (row) nightMedIds.add(row.id);
  }

  const takenNightMeds = taken.filter((r) => {
    if (r.substance_id != null && nightMedIds.has(r.substance_id)) return true;
    return plannedLower.has(nameKey(r.substance_name));
  });

  return takenNightMeds.length >= planned.length ? day : null;
}

export interface NewPlanItem {
  substance_id?: number | null;
  substance_name: string;
  strength?: string | null;
  morning?: string | null;
  noon?: string | null;
  evening?: string | null;
  night?: string | null;
  unit?: string | null;
  reason?: string | null;
  notes?: string | null;
}

/**
 * Erstellt eine neue Plan-Version (Snapshot) und gibt sie zurück.
 * `effectiveFrom` ("YYYY-MM-DD" oder "YYYY-MM-DDTHH:mm") darf in der
 * Vergangenheit oder Zukunft liegen; ohne Angabe gilt die Version ab heute.
 */
export const createPlanVersion = db.transaction(
  (items: NewPlanItem[], note: string | null, effectiveFrom?: string | null): PlanVersionRow => {
    const now = nowLocalISO();
    const info = db
      .prepare(`INSERT INTO plan_versions (created_at, effective_from, note) VALUES (?, ?, ?)`)
      .run(now, effectiveFrom ?? dateOf(now), note);
    const versionId = Number(info.lastInsertRowid);
    const insert = db.prepare(
      `INSERT INTO plan_items
        (version_id, substance_id, substance_name, strength, morning, noon, evening, night, unit, reason, notes, sort_order)
       VALUES (@version_id, @substance_id, @substance_name, @strength, @morning, @noon, @evening, @night, @unit, @reason, @notes, @sort_order)`,
    );
    items.forEach((it, i) => {
      insert.run({
        version_id: versionId,
        substance_id: it.substance_id ?? null,
        substance_name: it.substance_name,
        strength: it.strength ?? null,
        morning: it.morning ?? null,
        noon: it.noon ?? null,
        evening: it.evening ?? null,
        night: it.night ?? null,
        unit: it.unit ?? null,
        reason: it.reason ?? null,
        notes: it.notes ?? null,
        sort_order: i,
      });
    });
    return db.prepare(`SELECT * FROM plan_versions WHERE id = ?`).get(versionId) as PlanVersionRow;
  },
);

// ---------- Daten-Konsole: Change-Set-Helfer ----------

/** Legt ein vorgeschlagenes (noch nicht angewandtes) Change-Set an. */
export function insertChangeSet(input: {
  prompt: string;
  title: string;
  summary: string | null;
  operations: unknown;
  preview: unknown;
  affected: number;
}): ChatChangeSetRow {
  const now = nowLocalISO();
  const info = db
    .prepare(
      `INSERT INTO chat_change_sets (created_at, status, prompt, title, summary, operations, preview, affected)
       VALUES (?, 'proposed', ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      now,
      input.prompt,
      input.title,
      input.summary,
      JSON.stringify(input.operations),
      JSON.stringify(input.preview),
      input.affected,
    );
  return changeSetById(Number(info.lastInsertRowid))!;
}

export function changeSetById(id: number): ChatChangeSetRow | null {
  return (
    (db.prepare(`SELECT * FROM chat_change_sets WHERE id = ?`).get(id) as ChatChangeSetRow | undefined) ?? null
  );
}

/** Change-Sets (neueste zuerst). Optional nach Status filtern. */
export function listChangeSets(opts?: { limit?: number; status?: ChatChangeSetStatus }): ChatChangeSetRow[] {
  const where = opts?.status ? `WHERE status = @status` : '';
  const limit = opts?.limit && opts.limit > 0 ? `LIMIT ${Math.floor(opts.limit)}` : 'LIMIT 50';
  return db
    .prepare(`SELECT * FROM chat_change_sets ${where} ORDER BY id DESC ${limit}`)
    .all(opts?.status ? { status: opts.status } : {}) as ChatChangeSetRow[];
}

/**
 * Das jüngste tatsächlich angewandte Change-Set (für die „Undo"-Schaltfläche).
 * Maßgeblich ist die höchste id mit status='applied' — nur dieses darf
 * rückgängig gemacht werden (kein Undo „über" eine neuere Anwendung hinweg).
 */
export function latestAppliedChangeSet(): ChatChangeSetRow | null {
  return (
    (db
      .prepare(`SELECT * FROM chat_change_sets WHERE status = 'applied' ORDER BY id DESC LIMIT 1`)
      .get() as ChatChangeSetRow | undefined) ?? null
  );
}

export function markChangeSetApplied(id: number, undoSnapshot: unknown, affected: number): void {
  db.prepare(
    `UPDATE chat_change_sets
       SET status = 'applied', applied_at = ?, undo_snapshot = ?, affected = ?
     WHERE id = ?`,
  ).run(nowLocalISO(), JSON.stringify(undoSnapshot), affected, id);
}

export function markChangeSetUndone(id: number): void {
  db.prepare(`UPDATE chat_change_sets SET status = 'undone', undone_at = ? WHERE id = ?`).run(nowLocalISO(), id);
}

export function markChangeSetDiscarded(id: number): void {
  db.prepare(`UPDATE chat_change_sets SET status = 'discarded' WHERE id = ? AND status = 'proposed'`).run(id);
}
