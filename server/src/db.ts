import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from './config.js';
import { dateOf, nowLocalISO } from './lib/time.js';

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
`);

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
