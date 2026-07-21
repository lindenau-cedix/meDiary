import fs from 'node:fs';
import { config } from '../config.js';
import { db, type SubstanceRow } from '../db.js';
import { nameKey } from './substances.js';

/** Fügt zwischen Zahl und Buchstabe ein Leerzeichen ein: "100ml" → "100 ml" */
function normalizeAmount(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.replace(/(\d)([a-zA-ZäöüÄÖÜßµ])/g, '$1 $2');
}

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
    amount: normalizeAmount(parts[1]),
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
      amount = normalizeAmount(a[1]);
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

// ---------- Strukturierte Sections: Parser + Serializer ----------
// Frontend-tauglicher Repräsentationsform. `preLines` / `postLines` tragen
// Markup-Zeilen, die der Zeilen-Parser nicht in Menge/Notiz/Mit: einordnen
// kann (z.B. `NACH 2026-06-05 19:00 CEST: …` oder freie Kommentar-Blöcke)
// unverändert durch den Round-Trip, damit das nächtliche Träumen weiter
// auf dem Inhalt des Originaltextes trainiert.

/** Begleitstoff-Eintrag einer Sektion (entspricht einer `Mit:`-Zeile). */
export interface SectionCompanionInput {
  name: string;
  amount: string | null;
  note: string | null;
}

/** Strukturierte Sektion. `name` wird 1:1 in `## name` emittiert. */
export interface SectionInput {
  name: string;
  amount: string | null;
  note: string | null;
  companions: SectionCompanionInput[];
  /** Zeilen vor den strukturierten Feldern (verbatim). */
  preLines: string[];
  /** Zeilen nach den strukturierten Feldern (verbatim). */
  postLines: string[];
}

/** Ergebnis von `parseSections()`. `preamble` / `epilogue` werden 1:1 übernommen. */
export interface ParsedSections {
  preamble: string;
  sections: SectionInput[];
  epilogue: string;
}

/**
 * Zerlegt den Rohtext in strukturelle Sektionen + Vor- und Nachspann.
 * Wird genutzt, um den Inhalt verlustfrei zwischen Markdown-Datei und
 * Formular hin und her zu konvertieren.
 *
 * Konventionen, die wir hierfür spiegeln:
 *  - Headings der Ebene 1 = Dokumenttitel (bleibt in der `preamble`).
 *  - Headings der Ebene 2+ = Sektion.
 *  - `Menge:`/`Notiz:`/`Mit:` werden strukturiert erkannt (gleiche RegEx wie
 *    der eigentliche Parser oben).
 *  - Leerzeilen vor/nach Feldern und zwischen Sektionen werden verworfen;
 *    der Serializer stellt sie wieder hübsch her.
 *  - Alles andere unter einer Überschrift landet in `preLines` (vor dem
 *    ersten strukturierten Feld) oder `postLines` (danach).
 */
export function parseSections(content: string): ParsedSections {
  const lines = content.split(/\r?\n/);

  // Positionen der Heading-Linien (level>=2). Headings der Ebene 1 sind
  // Dokumenttitel und bleiben Teil des Preambles.
  const headingIdxs: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6})\s+(.*)$/);
    if (m && m[1].length >= 2) headingIdxs.push(i);
  }

  // Preamble endet bei der ersten Section-Überschrift (bzw. dem Dateiende).
  const firstSectionIdx = headingIdxs[0] ?? lines.length;
  const preambleLines = lines.slice(0, firstSectionIdx);
  const sectionLines = lines.slice(firstSectionIdx);

  // Section-Bereich: alles ab der ersten Section-Heading bis zum Dateiende.
  // Wir separieren Sections nach Headings (jede Section endet am nächsten
  // Heading, exklusiv) — die *letzte* Section reicht bis zum Dateiende,
  // ihr Inhalt landet in den entsprechenden `postLines` bzw. strukturierten
  // Feldern. Damit gibt es keinen Epilogue; trailing Kommentar-Blöcke
  // unterhalb der letzten Section-Heading sind Teil dieser Section.
  const sections: SectionInput[] = [];
  if (headingIdxs.length > 0) {
    for (let i = 0; i < headingIdxs.length; i++) {
      const start = headingIdxs[i] - firstSectionIdx;
      const end =
        i + 1 < headingIdxs.length
          ? headingIdxs[i + 1] - firstSectionIdx
          : sectionLines.length;
      const block = sectionLines.slice(start, end);
      const pushed = parseOneSectionBlock(block);
      if (pushed) sections.push(pushed);
    }
  }

  return {
    preamble: preambleLines.join('\n'),
    sections,
    epilogue: '',
  };
}

/** Parst eine einzelne Section (beginnt mit Heading-Zeile, endet vor nächster Heading). */
function parseOneSectionBlock(block: string[]): SectionInput | null {
  // Erste Zeile = Heading "## name".
  const heading = block[0].match(/^(#{2,6})\s+(.*)$/);
  if (!heading) return null;
  const name = heading[2].trim();

  const companions: SectionCompanionInput[] = [];
  let amount: string | null = null;
  let noteExplicit: string | null = null;
  const preLines: string[] = [];
  const postLines: string[] = [];
  let structuredSeen = false; // ab dem ersten Menge/Notiz/Mit landet alles Weitere in postLines

  for (let i = 1; i < block.length; i++) {
    const line = block[i];
    if (!line.trim()) continue; // Leerzeilen werden ignoriert

    const a = line.match(AMOUNT_RE);
    if (a) {
      amount = normalizeAmount(a[1]);
      structuredSeen = true;
      continue;
    }
    const n = line.match(NOTE_RE);
    if (n) {
      noteExplicit = (noteExplicit ? noteExplicit + '\n' : '') + n[1].trim();
      structuredSeen = true;
      continue;
    }
    const c = line.match(COMPANION_RE);
    if (c) {
      const comp = parseCompanion(c[1]);
      if (comp) companions.push(comp);
      structuredSeen = true;
      continue;
    }
    // Unerkannte Zeile: pre oder post je nach Position relativ zu strukturierten Feldern.
    if (structuredSeen) postLines.push(line.trim());
    else preLines.push(line.trim());
  }

  const note = noteExplicit?.trim() || null;
  return { name, amount, note, companions, preLines, postLines };
}

/**
 * Serialisiert strukturierte Sektionen zurück in einen Markdown-Text, den
 * der bestehende Parser ohne Verluste wieder einliest. Leere Sektionen
 * (kein Menge, kein Notiz, keine Companions, keine pre/post-Zeilen) werden
 * komplett weggelassen — sie würden den "leeren Eintrag"-Filter des
 * Compliance-Reports ohnehin nicht auslösen, der Serializer räumt sie aber
 * aktiv auf.
 *
 * Format-Details siehe Plan.
 */
export function serializeSections(sections: SectionInput[]): string {
  const blocks: string[] = [];

  for (const s of sections) {
    const hasAny =
      !!s.amount ||
      !!s.note ||
      s.companions.length > 0 ||
      s.preLines.length > 0 ||
      s.postLines.length > 0;
    if (!hasAny) continue;

    const out: string[] = [];
    out.push(`## ${s.name}`);
    if (s.preLines.length > 0) {
      out.push('');
      for (const pl of s.preLines) out.push(pl);
    }
    if (s.amount) {
      out.push('');
      out.push(`Menge: ${s.amount}`);
    }
    if (s.note) {
      out.push('');
      // Mehrzeilige Notiz: erste Zeile mit `Notiz:`, Rest unprefixed (Parser
      // sammelt unprefixed Zeilen automatisch wieder in noteLines).
      const noteLines = s.note.split(/\r?\n/);
      out.push(`Notiz: ${noteLines[0]}`);
      for (let i = 1; i < noteLines.length; i++) out.push(noteLines[i]);
    }
    for (const c of s.companions) {
      out.push('');
      out.push(formatCompanion(c));
    }
    if (s.postLines.length > 0) {
      out.push('');
      for (const pl of s.postLines) out.push(pl);
    }
    blocks.push(out.join('\n'));
  }

  return blocks.join('\n\n') + (blocks.length > 0 ? '\n' : '');
}

/**
 * Baut aus dem ParseSections-Ergebnis den vollständigen Markdown-Text inkl.
 * Preamble (Dokumenttitel + Erklärung) und Epilogue (trailing Kommentare)
 * zusammen. Wird vom Route-Handler genutzt, damit nichts vom Originaltext
 * verloren geht, was nicht in eine Section gepasst hat.
 */
export function buildMarkdownFromParsed(parsed: ParsedSections): string {
  const blocks = parsed.sections
    .map(serializeOneSectionBlock)
    .filter((b): b is string => !!b);

  const parts: string[] = [];
  const preamble = parsed.preamble.replace(/\s+$/, '').replace(/^\s+/, '');
  if (preamble) {
    parts.push(preamble);
    if (blocks.length > 0 || parsed.epilogue.trim()) parts.push('');
  }
  if (blocks.length > 0) parts.push(blocks.join('\n\n'));
  if (parsed.epilogue.trim()) {
    if (parts.length > 0 && !parts[parts.length - 1].endsWith('')) parts.push('');
    parts.push(parsed.epilogue.replace(/^\s+|\s+$/g, ''));
  }
  return parts.length > 0 ? parts.join('\n') + '\n' : '';
}

function serializeOneSectionBlock(s: SectionInput): string | null {
  const hasAny =
    !!s.amount ||
    !!s.note ||
    s.companions.length > 0 ||
    s.preLines.length > 0 ||
    s.postLines.length > 0;
  if (!hasAny) return null;

  const out: string[] = [];
  out.push(`## ${s.name}`);
  if (s.preLines.length > 0) {
    out.push('');
    for (const pl of s.preLines) out.push(pl);
  }
  if (s.amount) {
    out.push('');
    out.push(`Menge: ${s.amount}`);
  }
  if (s.note) {
    out.push('');
    const noteLines = s.note.split(/\r?\n/);
    out.push(`Notiz: ${noteLines[0]}`);
    for (let i = 1; i < noteLines.length; i++) out.push(noteLines[i]);
  }
  for (const c of s.companions) {
    out.push('');
    out.push(formatCompanion(c));
  }
  if (s.postLines.length > 0) {
    out.push('');
    for (const pl of s.postLines) out.push(pl);
  }
  return out.join('\n');
}

function formatCompanion(c: SectionCompanionInput): string {
  const hasAmount = !!c.amount;
  const hasNote = !!c.note;
  if (hasAmount && hasNote) return `Mit: ${c.name} | ${c.amount} | ${c.note}`;
  if (hasAmount) return `Mit: ${c.name} | ${c.amount}`;
  return `Mit: ${c.name}`;
}

/**
 * Validiert die Eingabe vor dem Schreiben. Liefert entweder `{ ok: true }`
 * oder `{ ok: false, error: string }`. Wird sowohl von der Route als auch
 * (optional) von Tests verwendet.
 */
export function validateSections(sections: SectionInput[]): { ok: true } | { ok: false; error: string } {
  const seenNames = new Map<string, number>();
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    const name = s.name.trim();
    if (!name) return { ok: false, error: `Sektion ${i + 1}: Name fehlt` };
    if (/^#{1,6}\s/.test(name)) return { ok: false, error: `Sektion ${i + 1}: Name darf nicht mit '#' beginnen` };
    if (name.includes('\n') || name.includes('\r')) return { ok: false, error: `Sektion ${i + 1}: Name darf keinen Zeilenumbruch enthalten` };
    if (s.amount != null && s.amount.length > 80) return { ok: false, error: `Sektion "${name}": Menge zu lang (max. 80 Zeichen)` };
    if (s.note != null && s.note.length > 1000) return { ok: false, error: `Sektion "${name}": Notiz zu lang (max. 1000 Zeichen)` };

    const key = nameKey(name);
    if (seenNames.has(key)) return { ok: false, error: `Doppelter Substanzname (case-insensitive): "${name}"` };
    seenNames.set(key, i);

    // Companions: kein Self-Reference, keine Duplikate innerhalb der Sektion.
    const compSeen = new Map<string, number>();
    for (let j = 0; j < s.companions.length; j++) {
      const c = s.companions[j];
      const cn = c.name.trim();
      if (!cn) return { ok: false, error: `Sektion "${name}", Mit-Zeile ${j + 1}: Name fehlt` };
      const ck = nameKey(cn);
      if (ck === key) return { ok: false, error: `Sektion "${name}": "${cn}" kann nicht sein eigener Begleitstoff sein` };
      if (compSeen.has(ck)) return { ok: false, error: `Sektion "${name}": Begleitstoff "${cn}" mehrfach aufgeführt` };
      compSeen.set(ck, j);
      if (c.amount != null && c.amount.length > 80) return { ok: false, error: `Sektion "${name}", Mit-Zeile ${j + 1}: Menge zu lang` };
      if (c.note != null && c.note.length > 1000) return { ok: false, error: `Sektion "${name}", Mit-Zeile ${j + 1}: Notiz zu lang` };
    }
  }
  return { ok: true };
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
