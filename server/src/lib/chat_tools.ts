import Database from 'better-sqlite3';
import { z } from 'zod';
import { config } from '../config.js';
import { db, type IntakeRow, type SubstanceRow } from '../db.js';
import { nameKey } from './names.js';
import { findOrCreateSubstance } from './substances.js';
import { defaultAmountFor } from './defaults.js';
import { nowLocalISO, normalizeDateTime, toLocalISO } from './time.js';

/**
 * Werkzeuge & Sicherheitsschicht der „Daten-Konsole" (Chat with your data).
 *
 * Zwei-Phasen-Design (nicht verhandelbar — siehe Skill-Brief):
 *  - **Lese-Werkzeuge** (`inspect_schema`, `run_read_query`) laufen sofort, aber
 *    AUSSCHLIESSLICH über eine separate, schreibgeschützte SQLite-Verbindung
 *    (`{ readonly: true }`). Selbst wenn das Modell eine schreibende Anweisung
 *    formuliert, kann sie physisch nicht greifen.
 *  - **Schreib-Werkzeug** (`propose_change_set`) führt NICHTS aus. Das Modell
 *    liefert nur typisierte, validierte Operationen; der Server kompiliert sie
 *    zu parametrisierten Queries, rechnet einen Dry-Run und legt das Change-Set
 *    als `proposed` ab. Angewandt wird erst nach ausdrücklicher Bestätigung in
 *    der UI — transaktional, mit Vorzustands-Snapshot für „Undo".
 *
 * Niemals führt das Modell rohes Schreib-SQL aus. Die Operationen sind ein
 * geschlossener, auf das meDiary-Schema zugeschnittener Satz; `run_read_query`
 * ist der einzige (read-only) SQL-Pfad.
 */

// ───────────────────────── Read-only-Verbindung ─────────────────────────

let roDb: Database.Database | null = null;

/**
 * Separate, schreibgeschützte Verbindung auf dieselbe DB-Datei. `readonly: true`
 * ist die harte Garantie: jeder Schreibversuch wirft `SQLITE_READONLY`, egal was
 * das Modell sendet. WAL erlaubt parallele Leser ohne den Hauptprozess zu
 * blockieren. Lazy geöffnet, danach wiederverwendet.
 */
function readonlyDb(): Database.Database {
  if (!roDb) {
    roDb = new Database(config.dbPath, { readonly: true });
    roDb.pragma('busy_timeout = 3000');
    // Doppelt abgesichert: query_only verbietet Schreibvorgänge auch dann, wenn
    // die Verbindung je versehentlich r/w geöffnet würde.
    roDb.pragma('query_only = TRUE');
  }
  return roDb;
}

// ───────────────────────── Tool-Definitionen (Anthropic-Format) ─────────────────────────

/** Tabellen, die der Konsole zugänglich sind (Lesen frei, Schreiben nur typisiert). */
const READABLE_TABLES = [
  'substances',
  'intakes',
  'plan_versions',
  'plan_items',
  'daily_assessments',
  'daily_habits',
  'dreams',
] as const;

export const DB_TOOLS = [
  {
    name: 'inspect_schema',
    description:
      'Liefert das reale DB-Schema (Tabellen, Spalten, Typen, Zeilenzahl) plus wichtige Hinweise ' +
      '(Konsum-Tag-Grenze 03:30, Umlaut-Normalisierung). Vor dem Schreiben von Read-Queries nützlich.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'run_read_query',
    description:
      'Führt EINE schreibgeschützte SQL-SELECT-Abfrage aus (SELECT/WITH; nur eine Anweisung). ' +
      'Läuft über eine read-only-Verbindung — Schreibvorgänge sind unmöglich. Maximal ' +
      `${config.chat.maxRows} Zeilen werden zurückgegeben. Nutze dies, um Fragen zu beantworten ` +
      'und Änderungen vorab zu prüfen (betroffene Zeilen zählen/ansehen), BEVOR du ein Change-Set vorschlägst.',
    input_schema: {
      type: 'object',
      properties: { sql: { type: 'string', description: 'Eine einzelne SELECT/WITH-Abfrage.' } },
      required: ['sql'],
      additionalProperties: false,
    },
  },
  {
    name: 'propose_change_set',
    description:
      'Schlägt eine Massen-Änderung als Stapel typisierter Operationen vor. Führt NICHTS aus — ' +
      'der/die Nutzer:in prüft Vorschau (betroffene Zeilen + before→after) und bestätigt erst in der UI. ' +
      'Schlage erst vor, wenn die Anfrage eindeutig ist; bei Unklarheit frage nach, statt destruktiv zu raten. ' +
      'Operationstypen:\n' +
      '• update_intakes {filter, set:{amount?,notes?,substanceName?}} — Felder bei passenden Einnahmen setzen (null = leeren).\n' +
      '• delete_intakes {filter} — passende Einnahmen löschen.\n' +
      '• shift_intakes_time {filter, minutes} — taken_at um ±Minuten verschieben (z. B. -1440 = einen Tag zurück).\n' +
      '• backfill_intakes {substanceName, dates:[YYYY-MM-DD], time?:"HH:mm", amount?, notes?} — Einnahmen nachtragen (eine je Datum).\n' +
      '• merge_substances {from, into, archiveFrom?} — alle Einnahmen von „from" auf „into" umhängen, „from" archivieren.\n' +
      '• rename_substance {from, to} — Substanz umbenennen (inkl. Einnahmen-Namen).\n' +
      '• set_night_med {substanceName, isNightMed} — Nachtmedikations-Flag setzen.\n' +
      'filter (alle Felder optional, UND-verknüpft): {ids?:[number], substanceName?, substanceId?, dateFrom?:YYYY-MM-DD, dateTo?:YYYY-MM-DD, notesContains?}. ' +
      'Ein leerer filter trifft ALLE Einnahmen — sei so spezifisch wie die Anfrage.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Kurzer Titel der Änderung (z. B. „Workout in Training zusammenführen").' },
        summary: { type: 'string', description: 'Optionaler Satz, was passiert und warum.' },
        operations: {
          type: 'array',
          description: 'Ein oder mehrere typisierte Operationen (siehe Tool-Beschreibung).',
          items: { type: 'object' },
        },
      },
      required: ['title', 'operations'],
      additionalProperties: false,
    },
  },
] as const;

// ───────────────────────── inspect_schema ─────────────────────────

export interface SchemaTable {
  name: string;
  rowCount: number;
  columns: { name: string; type: string; notnull: boolean; pk: boolean }[];
}

export interface SchemaInfo {
  tables: SchemaTable[];
  notes: string[];
}

export function runInspectSchema(): SchemaInfo {
  const rdb = readonlyDb();
  const tables: SchemaTable[] = [];
  for (const name of READABLE_TABLES) {
    const cols = rdb.prepare(`PRAGMA table_info(${name})`).all() as {
      name: string;
      type: string;
      notnull: number;
      pk: number;
    }[];
    if (cols.length === 0) continue;
    const { c } = rdb.prepare(`SELECT COUNT(*) AS c FROM ${name}`).get() as { c: number };
    tables.push({
      name,
      rowCount: c,
      columns: cols.map((col) => ({ name: col.name, type: col.type, notnull: !!col.notnull, pk: !!col.pk })),
    });
  }
  return {
    tables,
    notes: [
      'Zeiten sind lokale Wanduhr-Strings „YYYY-MM-DDTHH:mm:ss" (Europe/Berlin), KEIN UTC/Offset.',
      'Konsum-/Medikations-Tag hat die Grenze 03:30: Einnahmen 00:00–03:29 zählen zum Vortag.',
      'intakes.substance_name ist redundant zu substances.name gespeichert; substance_id kann NULL sein.',
      'Namensvergleiche sind case-insensitive & umlaut-bewusst (deutsche Kleinschreibung) — nutze für Filter substanceName, nicht lower().',
      'Nur SELECT/WITH erlaubt; die Verbindung ist schreibgeschützt.',
    ],
  };
}

// ───────────────────────── run_read_query ─────────────────────────

export interface ReadQueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  truncated: boolean;
}

// Nur Anweisungen, die selbst auf einer read-only-Verbindung Schaden anrichten
// könnten (ATTACH bindet eine andere — evtl. schreibbare — DB ein). Echte
// Schreib-DML/DDL ist bereits durch `readonly`, die Einzel-Statement-Prüfung von
// `prepare()` und den `reader`-Check unten ausgeschlossen — die Funktion
// REPLACE() o. Ä. darf in einem SELECT also vorkommen.
const FORBIDDEN_READ = /\b(attach|detach|pragma)\b/i;

/**
 * Führt eine einzelne SELECT/WITH-Abfrage read-only aus. Mehrere Garantien:
 *  1. Verbindung ist `readonly` → jeder Schreibversuch wirft.
 *  2. better-sqlite3 `prepare()` akzeptiert nur EINE Anweisung (kein „…; DROP …").
 *  3. Muss mit SELECT/WITH beginnen; ATTACH/PRAGMA/DML/DDL werden vorab abgelehnt.
 *  4. Ergebnis auf `config.chat.maxRows` begrenzt.
 */
export function runReadQuery(sqlRaw: string): ReadQueryResult {
  const sql = sqlRaw.trim().replace(/;\s*$/, '');
  if (!sql) throw new Error('Leere Abfrage.');
  if (!/^(select|with)\b/i.test(sql)) {
    throw new Error('Nur SELECT/WITH-Abfragen sind erlaubt (read-only).');
  }
  if (FORBIDDEN_READ.test(sql)) {
    throw new Error('Verbotenes Schlüsselwort: nur lesende SELECT/WITH-Abfragen sind erlaubt.');
  }
  const rdb = readonlyDb();
  let stmt: Database.Statement;
  try {
    stmt = rdb.prepare(sql); // wirft bei mehr als einer Anweisung
  } catch (e) {
    throw new Error(`SQL-Fehler: ${(e as Error).message}`);
  }
  if (!stmt.reader) throw new Error('Abfrage liefert keine Zeilen (kein SELECT).');
  const all = stmt.all() as Record<string, unknown>[];
  const max = config.chat.maxRows;
  const rows = all.slice(0, max);
  const columns = stmt.columns().map((c) => c.name);
  return { columns, rows, rowCount: all.length, truncated: all.length > max };
}

// ───────────────────────── Typisierte Operationen ─────────────────────────

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Datum muss YYYY-MM-DD sein');
const timeStr = z.string().regex(/^\d{2}:\d{2}$/, 'Zeit muss HH:mm sein');

const intakeFilterSchema = z
  .object({
    ids: z.array(z.number().int().positive()).nonempty().optional(),
    substanceName: z.string().trim().min(1).optional(),
    substanceId: z.number().int().positive().optional(),
    dateFrom: dateStr.optional(),
    dateTo: dateStr.optional(),
    notesContains: z.string().min(1).optional(),
  })
  .strict();

export type IntakeFilter = z.infer<typeof intakeFilterSchema>;

const operationSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('update_intakes'),
      filter: intakeFilterSchema,
      set: z
        .object({
          amount: z.string().nullable().optional(),
          notes: z.string().nullable().optional(),
          substanceName: z.string().trim().min(1).optional(),
        })
        .strict()
        .refine((s) => Object.keys(s).length > 0, 'set darf nicht leer sein'),
    })
    .strict(),
  z.object({ type: z.literal('delete_intakes'), filter: intakeFilterSchema }).strict(),
  z
    .object({
      type: z.literal('shift_intakes_time'),
      filter: intakeFilterSchema,
      minutes: z.number().int().refine((m) => m !== 0, 'minutes darf nicht 0 sein'),
    })
    .strict(),
  z
    .object({
      type: z.literal('backfill_intakes'),
      substanceName: z.string().trim().min(1),
      dates: z.array(dateStr).nonempty(),
      time: timeStr.optional(),
      amount: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('merge_substances'),
      from: z.string().trim().min(1),
      into: z.string().trim().min(1),
      archiveFrom: z.boolean().optional(),
    })
    .strict(),
  z
    .object({ type: z.literal('rename_substance'), from: z.string().trim().min(1), to: z.string().trim().min(1) })
    .strict(),
  z
    .object({ type: z.literal('set_night_med'), substanceName: z.string().trim().min(1), isNightMed: z.boolean() })
    .strict(),
]);

export type ChangeOperation = z.infer<typeof operationSchema>;

export function validateOperations(
  raw: unknown,
): { ok: true; operations: ChangeOperation[] } | { ok: false; error: string } {
  const arr = z.array(operationSchema).min(1, 'Mindestens eine Operation erforderlich.').safeParse(raw);
  if (!arr.success) {
    const issues = arr.error.issues
      .slice(0, 6)
      .map((i) => `• operations${i.path.length ? '[' + i.path.join('][') + ']' : ''}: ${i.message}`)
      .join('\n');
    return { ok: false, error: `Ungültige Operationen:\n${issues}` };
  }
  // Semantische Prüfungen, die nicht in die discriminatedUnion passen (würden
  // sie zu ZodEffects machen): „from" und „into"/„to" müssen verschieden sein.
  for (const op of arr.data) {
    if (op.type === 'merge_substances' && nameKey(op.from) === nameKey(op.into)) {
      return { ok: false, error: 'merge_substances: „from" und „into" müssen verschiedene Substanzen sein.' };
    }
    if (op.type === 'rename_substance' && nameKey(op.from) === nameKey(op.to)) {
      return { ok: false, error: 'rename_substance: „from" und „to" dürfen nicht identisch sein.' };
    }
  }
  return { ok: true, operations: arr.data };
}

// ───────────────────────── Filter-Auflösung ─────────────────────────

/**
 * Löst einen IntakeFilter zu konkreten Einnahme-Zeilen auf. Günstige Prädikate
 * (ids/substanceId/Datumsbereich/notesContains) laufen als parametrisierte SQL;
 * der Namensabgleich (substanceName) erfolgt in JS über nameKey, weil SQLite's
 * `lower()` keine Umlaute faltet. Vorschau UND Anwendung teilen sich diese
 * Auflösung, damit der Dry-Run exakt die später geänderten Zeilen zeigt.
 */
function resolveIntakes(filter: IntakeFilter): IntakeRow[] {
  const where: string[] = [];
  const params: Record<string, unknown> = {};
  if (filter.ids?.length) {
    where.push(`id IN (${filter.ids.map((_, i) => `@id${i}`).join(',')})`);
    filter.ids.forEach((v, i) => (params[`id${i}`] = v));
  }
  if (filter.substanceId != null) {
    where.push(`substance_id = @sid`);
    params.sid = filter.substanceId;
  }
  if (filter.dateFrom) {
    where.push(`taken_at >= @from`);
    params.from = `${filter.dateFrom}T00:00:00`;
  }
  if (filter.dateTo) {
    where.push(`taken_at <= @to`);
    params.to = `${filter.dateTo}T23:59:59`;
  }
  if (filter.notesContains) {
    where.push(`notes LIKE @notes ESCAPE '\\'`);
    params.notes = `%${filter.notesContains.replace(/[\\%_]/g, '\\$&')}%`;
  }
  const sql = `SELECT * FROM intakes ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY taken_at DESC, id DESC`;
  let rows = db.prepare(sql).all(params) as IntakeRow[];
  if (filter.substanceName) {
    const key = nameKey(filter.substanceName);
    rows = rows.filter((r) => nameKey(r.substance_name) === key);
  }
  return rows;
}

/** Findet eine Substanz per Name (aktiv/archiviert, umlaut-bewusst), ohne sie anzulegen. */
function findSubstanceByName(name: string): SubstanceRow | null {
  const key = nameKey(name);
  const rows = db.prepare(`SELECT * FROM substances ORDER BY archived_at IS NOT NULL, id`).all() as SubstanceRow[];
  return rows.find((s) => nameKey(s.name) === key) ?? null;
}

// ───────────────────────── Vorschau (Dry-Run) ─────────────────────────

export type DiffOp = 'update' | 'delete' | 'create';

export interface DiffRow {
  table: 'intakes' | 'substances';
  id: number | null;
  op: DiffOp;
  label: string;
  before: Record<string, string | null> | null;
  after: Record<string, string | null> | null;
  changedKeys: string[];
}

export interface OperationPreview {
  type: ChangeOperation['type'];
  label: string;
  affected: number;
  /** Hinweis, falls eine Substanz/ein Ziel nicht gefunden wurde (Operation wird zum No-op). */
  warning?: string;
}

export interface ChangeSetPreview {
  operations: OperationPreview[];
  totalAffected: number;
  samples: DiffRow[];
  /** true, wenn Samples gekürzt wurden. */
  sampleTruncated: boolean;
}

const SAMPLE_CAP = 14;

function intakeLabel(r: IntakeRow): string {
  return `${r.substance_name} · ${r.taken_at.slice(0, 16).replace('T', ' ')}`;
}

function intakeView(r: IntakeRow): Record<string, string | null> {
  return { substance: r.substance_name, takenAt: r.taken_at, amount: r.amount, notes: r.notes };
}

/** Verschiebt einen lokalen Datetime-String um `minutes` Minuten. */
function shiftLocal(takenAt: string, minutes: number): string {
  const d = new Date(normalizeDateTime(takenAt));
  d.setMinutes(d.getMinutes() + minutes);
  return toLocalISO(d);
}

export function previewOperations(operations: ChangeOperation[]): ChangeSetPreview {
  const ops: OperationPreview[] = [];
  const samples: DiffRow[] = [];
  let totalAffected = 0;
  let sampleTruncated = false;

  const pushSample = (row: DiffRow) => {
    if (samples.length < SAMPLE_CAP) samples.push(row);
    else sampleTruncated = true;
  };

  for (const op of operations) {
    switch (op.type) {
      case 'update_intakes': {
        const rows = resolveIntakes(op.filter);
        totalAffected += rows.length;
        ops.push({ type: op.type, label: describeOperation(op), affected: rows.length });
        for (const r of rows) {
          const before = intakeView(r);
          const after = { ...before };
          const changed: string[] = [];
          if (op.set.amount !== undefined && (op.set.amount ?? null) !== r.amount) {
            after.amount = op.set.amount ?? null;
            changed.push('amount');
          }
          if (op.set.notes !== undefined && (op.set.notes ?? null) !== r.notes) {
            after.notes = op.set.notes ?? null;
            changed.push('notes');
          }
          if (op.set.substanceName !== undefined && op.set.substanceName !== r.substance_name) {
            after.substance = op.set.substanceName;
            changed.push('substance');
          }
          if (changed.length) {
            pushSample({ table: 'intakes', id: r.id, op: 'update', label: intakeLabel(r), before, after, changedKeys: changed });
          }
        }
        break;
      }
      case 'delete_intakes': {
        const rows = resolveIntakes(op.filter);
        totalAffected += rows.length;
        ops.push({ type: op.type, label: describeOperation(op), affected: rows.length });
        for (const r of rows) {
          pushSample({ table: 'intakes', id: r.id, op: 'delete', label: intakeLabel(r), before: intakeView(r), after: null, changedKeys: [] });
        }
        break;
      }
      case 'shift_intakes_time': {
        const rows = resolveIntakes(op.filter);
        totalAffected += rows.length;
        ops.push({ type: op.type, label: describeOperation(op), affected: rows.length });
        for (const r of rows) {
          const before = intakeView(r);
          const newTaken = shiftLocal(r.taken_at, op.minutes);
          pushSample({
            table: 'intakes',
            id: r.id,
            op: 'update',
            label: intakeLabel(r),
            before,
            after: { ...before, takenAt: newTaken },
            changedKeys: ['takenAt'],
          });
        }
        break;
      }
      case 'backfill_intakes': {
        const time = op.time ?? '12:00';
        const sub = findSubstanceByName(op.substanceName);
        totalAffected += op.dates.length;
        ops.push({ type: op.type, label: describeOperation(op), affected: op.dates.length });
        for (const d of op.dates) {
          const takenAt = `${d}T${time}:00`;
          pushSample({
            table: 'intakes',
            id: null,
            op: 'create',
            label: `${sub?.name ?? op.substanceName} · ${d} ${time}`,
            before: null,
            after: { substance: sub?.name ?? op.substanceName, takenAt, amount: op.amount ?? (sub ? defaultAmountFor(sub.name) : null) ?? null, notes: op.notes ?? null },
            changedKeys: ['substance', 'takenAt'],
          });
        }
        break;
      }
      case 'merge_substances': {
        const from = findSubstanceByName(op.from);
        const into = findSubstanceByName(op.into);
        const rows = from ? resolveIntakes({ substanceName: op.from }) : [];
        totalAffected += rows.length + (from ? 1 : 0);
        ops.push({
          type: op.type,
          label: describeOperation(op),
          affected: rows.length,
          warning: from ? undefined : `Substanz „${op.from}" nicht gefunden — Operation wird übersprungen.`,
        });
        const targetName = into?.name ?? op.into;
        for (const r of rows) {
          pushSample({
            table: 'intakes',
            id: r.id,
            op: 'update',
            label: intakeLabel(r),
            before: intakeView(r),
            after: { ...intakeView(r), substance: targetName },
            changedKeys: ['substance'],
          });
        }
        if (from) {
          pushSample({
            table: 'substances',
            id: from.id,
            op: 'update',
            label: `Substanz „${from.name}" archivieren`,
            before: { name: from.name, archived: from.archived_at ? 'ja' : 'nein' },
            after: { name: from.name, archived: op.archiveFrom === false ? 'nein' : 'ja' },
            changedKeys: op.archiveFrom === false ? [] : ['archived'],
          });
        }
        break;
      }
      case 'rename_substance': {
        const from = findSubstanceByName(op.from);
        const rows = from ? resolveIntakes({ substanceName: op.from }) : [];
        totalAffected += rows.length + (from ? 1 : 0);
        ops.push({
          type: op.type,
          label: describeOperation(op),
          affected: rows.length + (from ? 1 : 0),
          warning: from ? undefined : `Substanz „${op.from}" nicht gefunden — Operation wird übersprungen.`,
        });
        if (from) {
          pushSample({
            table: 'substances',
            id: from.id,
            op: 'update',
            label: `Substanz umbenennen`,
            before: { name: from.name },
            after: { name: op.to.trim() },
            changedKeys: ['name'],
          });
        }
        for (const r of rows) {
          pushSample({
            table: 'intakes',
            id: r.id,
            op: 'update',
            label: intakeLabel(r),
            before: intakeView(r),
            after: { ...intakeView(r), substance: op.to.trim() },
            changedKeys: ['substance'],
          });
        }
        break;
      }
      case 'set_night_med': {
        const sub = findSubstanceByName(op.substanceName);
        const changes = sub && !!sub.is_night_med !== op.isNightMed ? 1 : 0;
        totalAffected += changes;
        ops.push({
          type: op.type,
          label: describeOperation(op),
          affected: changes,
          warning: sub ? undefined : `Substanz „${op.substanceName}" nicht gefunden — Operation wird übersprungen.`,
        });
        if (sub) {
          pushSample({
            table: 'substances',
            id: sub.id,
            op: 'update',
            label: `Nachtmedikation: ${sub.name}`,
            before: { isNightMed: sub.is_night_med ? 'ja' : 'nein' },
            after: { isNightMed: op.isNightMed ? 'ja' : 'nein' },
            changedKeys: changes ? ['isNightMed'] : [],
          });
        }
        break;
      }
    }
  }

  return { operations: ops, totalAffected, samples, sampleTruncated };
}

/** Menschenlesbare Kurzbeschreibung einer Operation (für Audit-Log & Karten-Titel). */
export function describeOperation(op: ChangeOperation): string {
  switch (op.type) {
    case 'update_intakes':
      return `Einnahmen aktualisieren (${Object.keys(op.set).join(', ')})`;
    case 'delete_intakes':
      return `Einnahmen löschen`;
    case 'shift_intakes_time':
      return `Zeitpunkt um ${op.minutes > 0 ? '+' : ''}${op.minutes} Min verschieben`;
    case 'backfill_intakes':
      return `${op.dates.length}× „${op.substanceName}" nachtragen`;
    case 'merge_substances':
      return `„${op.from}" → „${op.into}" zusammenführen`;
    case 'rename_substance':
      return `„${op.from}" → „${op.to}" umbenennen`;
    case 'set_night_med':
      return `„${op.substanceName}" Nachtmed = ${op.isNightMed ? 'ja' : 'nein'}`;
  }
}

// ───────────────────────── Anwendung + Undo-Snapshot ─────────────────────────

export interface ChangeSnapshot {
  /** Vorzustand jeder berührten/gelöschten Einnahme (vollständige Zeile). */
  intakes: IntakeRow[];
  /** Vorzustand jeder berührten/archivierten Substanz. */
  substances: SubstanceRow[];
  /** Vom Change-Set NEU angelegte Einnahmen (Undo löscht sie). */
  createdIntakeIds: number[];
  /** Vom Change-Set NEU angelegte Substanzen (Undo löscht sie, wenn unreferenziert). */
  createdSubstanceIds: number[];
}

export interface ApplyResult {
  affected: number;
  snapshot: ChangeSnapshot;
}

/**
 * Wendet alle Operationen in EINER Transaktion an und liefert den
 * Vorzustands-Snapshot zurück. Jede berührte Zeile wird VOR der Änderung in den
 * Snapshot aufgenommen (per id dedupliziert), sodass `restoreSnapshot` exakt
 * zurückrollen kann. Wird vom Router innerhalb seiner eigenen Transaktion
 * aufgerufen (mit `db.transaction`).
 */
export const applyOperations = db.transaction((operations: ChangeOperation[]): ApplyResult => {
  const intakeSnap = new Map<number, IntakeRow>();
  const subSnap = new Map<number, SubstanceRow>();
  const createdIntakeIds: number[] = [];
  const createdSubstanceIds: number[] = [];
  let affected = 0;

  const snapIntake = (r: IntakeRow) => {
    if (!intakeSnap.has(r.id)) intakeSnap.set(r.id, r);
  };
  const snapSub = (s: SubstanceRow) => {
    if (!subSnap.has(s.id)) subSnap.set(s.id, s);
  };

  /** findOrCreate, das Neuanlagen für den Undo-Snapshot meldet. */
  const resolveOrCreateSub = (name: string): SubstanceRow => {
    const existing = findSubstanceByName(name);
    if (existing) return existing;
    const created = findOrCreateSubstance(name);
    createdSubstanceIds.push(created.id);
    return created;
  };

  for (const op of operations) {
    switch (op.type) {
      case 'update_intakes': {
        const rows = resolveIntakes(op.filter);
        const stmt = db.prepare(
          `UPDATE intakes SET amount = @amount, notes = @notes, substance_name = @name WHERE id = @id`,
        );
        for (const r of rows) {
          snapIntake(r);
          stmt.run({
            id: r.id,
            amount: op.set.amount !== undefined ? op.set.amount : r.amount,
            notes: op.set.notes !== undefined ? op.set.notes : r.notes,
            name: op.set.substanceName !== undefined ? op.set.substanceName : r.substance_name,
          });
          affected++;
        }
        break;
      }
      case 'delete_intakes': {
        const rows = resolveIntakes(op.filter);
        const stmt = db.prepare(`DELETE FROM intakes WHERE id = ?`);
        for (const r of rows) {
          snapIntake(r);
          stmt.run(r.id);
          affected++;
        }
        break;
      }
      case 'shift_intakes_time': {
        const rows = resolveIntakes(op.filter);
        const stmt = db.prepare(`UPDATE intakes SET taken_at = @taken WHERE id = @id`);
        for (const r of rows) {
          snapIntake(r);
          stmt.run({ id: r.id, taken: shiftLocal(r.taken_at, op.minutes) });
          affected++;
        }
        break;
      }
      case 'backfill_intakes': {
        const time = op.time ?? '12:00';
        const sub = resolveOrCreateSub(op.substanceName);
        const stmt = db.prepare(
          `INSERT INTO intakes (substance_id, substance_name, taken_at, amount, notes, created_at, source_event_id)
           VALUES (?, ?, ?, ?, ?, ?, 'console:backfill')`,
        );
        for (const d of op.dates) {
          const info = stmt.run(
            sub.id,
            sub.name,
            `${d}T${time}:00`,
            op.amount !== undefined ? op.amount : defaultAmountFor(sub.name),
            op.notes ?? null,
            nowLocalISO(),
          );
          createdIntakeIds.push(Number(info.lastInsertRowid));
          affected++;
        }
        break;
      }
      case 'merge_substances': {
        const from = findSubstanceByName(op.from);
        if (!from) break; // No-op (in der Vorschau gewarnt)
        const into = resolveOrCreateSub(op.into);
        snapSub(from);
        const rows = resolveIntakes({ substanceName: op.from });
        const stmt = db.prepare(`UPDATE intakes SET substance_id = @sid, substance_name = @name WHERE id = @id`);
        for (const r of rows) {
          snapIntake(r);
          stmt.run({ id: r.id, sid: into.id, name: into.name });
          affected++;
        }
        if (op.archiveFrom !== false && !from.archived_at) {
          db.prepare(`UPDATE substances SET archived_at = ? WHERE id = ?`).run(nowLocalISO(), from.id);
          affected++;
        }
        break;
      }
      case 'rename_substance': {
        const from = findSubstanceByName(op.from);
        if (!from) break;
        snapSub(from);
        db.prepare(`UPDATE substances SET name = ? WHERE id = ?`).run(op.to.trim(), from.id);
        affected++;
        const rows = resolveIntakes({ substanceName: op.from });
        const stmt = db.prepare(`UPDATE intakes SET substance_name = @name WHERE id = @id`);
        for (const r of rows) {
          snapIntake(r);
          stmt.run({ id: r.id, name: op.to.trim() });
          affected++;
        }
        break;
      }
      case 'set_night_med': {
        const sub = findSubstanceByName(op.substanceName);
        if (!sub || !!sub.is_night_med === op.isNightMed) break;
        snapSub(sub);
        db.prepare(`UPDATE substances SET is_night_med = ? WHERE id = ?`).run(op.isNightMed ? 1 : 0, sub.id);
        affected++;
        break;
      }
    }
  }

  return {
    affected,
    snapshot: {
      intakes: [...intakeSnap.values()],
      substances: [...subSnap.values()],
      createdIntakeIds,
      createdSubstanceIds,
    },
  };
});

/**
 * Macht ein angewandtes Change-Set rückgängig. Reihenfolge & deferred FK sorgen
 * dafür, dass Eltern (Substanzen) vor Kindern (Einnahmen) wiederhergestellt sind:
 *  1. neu angelegte Einnahmen löschen,
 *  2. neu angelegte Substanzen löschen,
 *  3. Vorzustands-Substanzen per INSERT OR REPLACE wiederherstellen,
 *  4. Vorzustands-Einnahmen per INSERT OR REPLACE wiederherstellen.
 */
export const restoreSnapshot = db.transaction((snapshot: ChangeSnapshot): void => {
  // `defer_foreign_keys` verschiebt die FK-Prüfung ans Transaktionsende — so darf
  // ein `INSERT OR REPLACE` einer Substanz (intern DELETE+INSERT) die referenzierenden
  // Einnahmen nicht zwischenzeitlich auf NULL setzen. SQLite setzt diese Pragma
  // automatisch beim COMMIT/ROLLBACK zurück (auch der umschließenden Transaktion),
  // sie „leakt" also nicht in spätere Operationen — empirisch bestätigt.
  db.pragma('defer_foreign_keys = ON');

  const delIntake = db.prepare(`DELETE FROM intakes WHERE id = ?`);
  for (const id of snapshot.createdIntakeIds) delIntake.run(id);

  const delSub = db.prepare(`DELETE FROM substances WHERE id = ?`);
  for (const id of snapshot.createdSubstanceIds) delSub.run(id);

  const insSub = db.prepare(
    `INSERT OR REPLACE INTO substances
       (id, name, default_dose, unit, color, is_night_med, sort_order, archived_at, created_at)
     VALUES (@id, @name, @default_dose, @unit, @color, @is_night_med, @sort_order, @archived_at, @created_at)`,
  );
  for (const s of snapshot.substances) insSub.run(s);

  const insIntake = db.prepare(
    `INSERT OR REPLACE INTO intakes
       (id, substance_id, substance_name, taken_at, amount, notes, created_at, source_event_id)
     VALUES (@id, @substance_id, @substance_name, @taken_at, @amount, @notes, @created_at, @source_event_id)`,
  );
  for (const r of snapshot.intakes) insIntake.run(r);
});
