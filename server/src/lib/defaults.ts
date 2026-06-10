import fs from 'node:fs';
import { config } from '../config.js';

/**
 * DEFAULTS.md liefert Standard-Notizen und Standard-Mengen pro Substanz.
 * Format – je Substanz ein Abschnitt der Ebene 2 (oder tiefer):
 *
 *   ## Substanzname
 *   Menge: 0,4–0,5 g
 *   Notiz: frei formulierter Hinweis …
 *
 * `Menge:` (alias `Dosis:`) → Standard-Menge, `Notiz:` (alias `Hinweis:`)
 * → Standard-Notiz. Zeilen ohne erkanntes Präfix gelten als Notiztext
 * (so bleibt reiner Fließtext unter einer Überschrift als Notiz nutzbar).
 * Eine Überschrift der Ebene 1 (`# …`) gilt als Dokumenttitel und wird
 * ignoriert.
 *
 * Die Datei wird bei JEDEM Aufruf frisch gelesen (kein Cache), damit
 * Änderungen sofort bei jedem Schreibvorgang der API greifen.
 */

export interface SubstanceDefault {
  note: string | null;
  amount: string | null;
}

const AMOUNT_RE = /^[-*]?\s*(?:\*\*)?\s*(?:Menge|Dosis|Amount)\s*(?:\*\*)?\s*:\s*(.+?)\s*\**\s*$/i;
const NOTE_RE = /^[-*]?\s*(?:\*\*)?\s*(?:Notiz|Note|Hinweis)\s*(?:\*\*)?\s*:\s*(.+?)\s*$/i;

function parse(content: string): Map<string, SubstanceDefault> {
  const map = new Map<string, SubstanceDefault>();
  const lines = content.split(/\r?\n/);

  let current: string | null = null;
  let amount: string | null = null;
  let noteExplicit: string | null = null;
  let noteLines: string[] = [];

  const flush = () => {
    if (current !== null) {
      const note = noteExplicit ?? (noteLines.join('\n').trim() || null);
      if (note || amount) map.set(current.toLowerCase(), { note, amount });
    }
    amount = null;
    noteExplicit = null;
    noteLines = [];
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

/** Standard-Notiz + -Menge einer Substanz (case-insensitive). */
export function defaultsFor(substanceName: string): SubstanceDefault {
  return load().get(substanceName.trim().toLowerCase()) ?? { note: null, amount: null };
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
