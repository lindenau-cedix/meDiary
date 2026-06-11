import fs from 'node:fs';
import { config } from '../config.js';
import { db, type SubstanceRow } from '../db.js';
import { nameKey } from './substances.js';

/**
 * DEFAULTS.md liefert Standard-Notizen und Standard-Mengen pro Substanz.
 * Format – je Substanz ein Abschnitt der Ebene 2 (oder tiefer):
 *
 *   ## Substanzname
 *   Menge: 0,4–0,5 g
 *   Notiz: frei formulierter Hinweis …
 *   Mit: Begleitsubstanz | Menge | Notiz
 *
 * `Menge:` (alias `Dosis:`) → Standard-Menge, `Notiz:` (alias `Hinweis:`)
 * → Standard-Notiz. `Mit:` (alias `Zusammen mit:`) nennt eine Begleitsubstanz,
 * die beim Eintragen automatisch als eigene Einnahme miterfasst wird —
 * Menge/Notiz dahinter sind optional (Pipe-getrennt); ohne Angabe gelten die
 * Defaults der Begleitsubstanz selbst. Mehrere `Mit:`-Zeilen sind möglich.
 * Zeilen ohne erkanntes Präfix gelten als Notiztext (so bleibt reiner
 * Fließtext unter einer Überschrift als Notiz nutzbar). Eine Überschrift der
 * Ebene 1 (`# …`) gilt als Dokumenttitel und wird ignoriert.
 *
 * Die Datei wird bei JEDEM Aufruf frisch gelesen (kein Cache), damit
 * Änderungen sofort bei jedem Schreibvorgang der API greifen.
 */

/** Begleitsubstanz aus einer `Mit:`-Zeile. */
export interface CompanionDefault {
  name: string;
  /** Menge der automatischen Einnahme; null = Defaults der Begleitsubstanz. */
  amount: string | null;
  /** Notiz der automatischen Einnahme; null = Defaults der Begleitsubstanz. */
  note: string | null;
}

export interface SubstanceDefault {
  note: string | null;
  amount: string | null;
  /** Begleitsubstanzen, die beim Eintragen automatisch miterfasst werden. */
  companions: CompanionDefault[];
}

const AMOUNT_RE = /^[-*]?\s*(?:\*\*)?\s*(?:Menge|Dosis|Amount)\s*(?:\*\*)?\s*:\s*(.+?)\s*\**\s*$/i;
const NOTE_RE = /^[-*]?\s*(?:\*\*)?\s*(?:Notiz|Note|Hinweis)\s*(?:\*\*)?\s*:\s*(.+?)\s*$/i;
const COMPANION_RE = /^[-*]?\s*(?:\*\*)?\s*(?:Mit|Zusammen mit|With)\s*(?:\*\*)?\s*:\s*(.+?)\s*$/i;

/** `Name | Menge | Notiz` → CompanionDefault (Menge/Notiz optional). */
function parseCompanion(raw: string): CompanionDefault | null {
  const parts = raw.split('|').map((p) => p.trim());
  const name = parts[0];
  if (!name) return null;
  return {
    name,
    amount: parts[1] || null,
    note: parts.slice(2).join(' | ').trim() || null,
  };
}

function parse(content: string): Map<string, SubstanceDefault> {
  const map = new Map<string, SubstanceDefault>();
  const lines = content.split(/\r?\n/);

  let current: string | null = null;
  let amount: string | null = null;
  let noteExplicit: string | null = null;
  let noteLines: string[] = [];
  let companions: CompanionDefault[] = [];

  const flush = () => {
    if (current !== null) {
      const note = noteExplicit ?? (noteLines.join('\n').trim() || null);
      if (note || amount || companions.length) {
        map.set(nameKey(current), { note, amount, companions });
      }
    }
    amount = null;
    noteExplicit = null;
    noteLines = [];
    companions = [];
  };

  for (const line of lines) {
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flush();
      const level = heading[1].length;
      // Ebene-1-Überschrift = Dokumenttitel → kein Substanz-Abschnitt
      current = level === 1 ? null : heading[2].trim();
      continue;
    }
    if (current === null) continue;

    const a = line.match(AMOUNT_RE);
    if (a) {
      amount = a[1].trim();
      continue;
    }
    const n = line.match(NOTE_RE);
    if (n) {
      noteExplicit = (noteExplicit ? noteExplicit + '\n' : '') + n[1].trim();
      continue;
    }
    const c = line.match(COMPANION_RE);
    if (c) {
      const companion = parseCompanion(c[1]);
      if (companion) companions.push(companion);
      continue;
    }
    if (line.trim()) noteLines.push(line.trim());
  }
  flush();
  return map;
}

/** Liest und parst DEFAULTS.md frisch (kein Cache). */
function load(): Map<string, SubstanceDefault> {
  let content: string;
  try {
    content = fs.readFileSync(config.defaultsPath, 'utf8');
  } catch {
    return new Map();
  }
  return parse(content);
}

/** Standard-Notiz + -Menge einer Substanz (case-insensitive, Unicode-aware). */
export function defaultsFor(substanceName: string): SubstanceDefault {
  return load().get(nameKey(substanceName)) ?? { note: null, amount: null, companions: [] };
}

export function defaultNoteFor(substanceName: string): string | null {
  return defaultsFor(substanceName).note;
}

export function defaultAmountFor(substanceName: string): string | null {
  return defaultsFor(substanceName).amount;
}

/** Alle Defaults als { substanz: { note, amount } } – für die Frontend-Vorschau. */
export function allDefaults(): Record<string, SubstanceDefault> {
  return Object.fromEntries(load());
}

export function readDefaultsRaw(): string {
  try {
    return fs.readFileSync(config.defaultsPath, 'utf8');
  } catch {
    return '';
  }
}

export function writeDefaultsRaw(content: string): void {
  fs.writeFileSync(config.defaultsPath, content, 'utf8');
}

// ---------- Compliance-Check ----------
// "Compliant" = jede Substanz, die in DB oder Einnahmen vorkommt, hat einen
// passenden Eintrag in DEFAULTS.md (case-insensitive Name-Match). Stoffe
// ohne Default-Notiz/Default-Menge werden hier als "missing" gelistet, damit
// die UI den Nutzer darauf hinweisen kann.

export interface SubstanceCompliance {
  /** Substanz-Name wie in der DB (Groß-/Kleinschreibung wie vorgefunden). */
  name: string;
  /** Anzahl Einnahmen, die auf diesen Namen entfallen. */
  intakeCount: number;
  /** True, wenn die Substanz in der Tabelle `substances` existiert (aktiv oder archiviert). */
  inSubstances: boolean;
  /** True, wenn DEFAULTS.md einen Abschnitt für diesen Namen hat. */
  hasDefault: boolean;
  /** Welcher DEFAULTS-Schlüssel (ggf. mit anderer Schreibweise) getroffen wurde. */
  matchedKey: string | null;
}

export interface ComplianceReport {
  /** Wann der Check gelaufen ist (lokale ISO-Zeit). */
  checkedAt: string;
  /** True, wenn DEFAULTS.md überhaupt lesbar war. */
  defaultsAvailable: boolean;
  /** Anzahl unterschiedlicher Substanz-Namen, die in DB oder Einnahmen vorkommen. */
  total: number;
  /** Substanzen mit passendem DEFAULTS-Eintrag. */
  compliant: SubstanceCompliance[];
  /** Substanzen OHNE passenden DEFAULTS-Eintrag (Aufforderung zum Nachtragen). */
  missing: SubstanceCompliance[];
}

interface NameAggregate {
  name: string;
  inSubstances: boolean;
  intakeCount: number;
}

function aggregateNames(): Map<string, NameAggregate> {
  const map = new Map<string, NameAggregate>();

  // Substanzen: jede Substanz zählt, auch archivierte.
  const subs = db
    .prepare(`SELECT name FROM substances`)
    .all() as Pick<SubstanceRow, 'name'>[];
  for (const s of subs) {
    const k = nameKey(s.name);
    if (!k) continue;
    const cur = map.get(k) ?? { name: s.name, inSubstances: false, intakeCount: 0 };
    cur.inSubstances = true;
    if (!cur.name) cur.name = s.name;
    map.set(k, cur);
  }

  // Einnahmen: zähle, wie oft jeder Substanzname vorkommt (auch wenn
  // keine Substanz-Zeile existiert – z. B. aus dem Importer).
  const intakeRows = db
    .prepare(`SELECT substance_name AS name, COUNT(*) AS c FROM intakes GROUP BY substance_name`)
    .all() as { name: string; c: number }[];
  for (const r of intakeRows) {
    const k = nameKey(r.name);
    if (!k) continue;
    const cur = map.get(k) ?? { name: r.name, inSubstances: false, intakeCount: 0 };
    cur.intakeCount += r.c;
    if (!cur.name) cur.name = r.name;
    map.set(k, cur);
  }

  return map;
}

/** Compliance-Bericht: alle Substanzen vs. DEFAULTS.md. */
export function complianceReport(): ComplianceReport {
  const defaults = load();
  const names = aggregateNames();
  const compliant: SubstanceCompliance[] = [];
  const missing: SubstanceCompliance[] = [];

  // Sortierung: fehlende zuerst, dann nach Häufigkeit, dann nach Name.
  const entries = [...names.values()].sort((a, b) => {
    if (a.inSubstances !== b.inSubstances) return a.inSubstances ? 1 : -1;
    if (a.intakeCount !== b.intakeCount) return b.intakeCount - a.intakeCount;
    return a.name.localeCompare(b.name, 'de');
  });

  for (const a of entries) {
    const key = nameKey(a.name);
    const match = defaults.get(key);
    const item: SubstanceCompliance = {
      name: a.name,
      intakeCount: a.intakeCount,
      inSubstances: a.inSubstances,
      hasDefault: !!match,
      matchedKey: match ? key : null,
    };
    (item.hasDefault ? compliant : missing).push(item);
  }

  return {
    checkedAt: new Date().toISOString(),
    defaultsAvailable: defaults.size > 0 || (() => { try { return fs.statSync(config.defaultsPath).isFile(); } catch { return false; } })(),
    total: entries.length,
    compliant,
    missing,
  };
}
