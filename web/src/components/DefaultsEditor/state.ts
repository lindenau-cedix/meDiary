/**
 * Lokaler Mirror von `server/src/lib/defaults.ts` für die Raw-Tab-Vorschau
 * und die strukturierten Felder. Bewusst NICHT der einzige Serializer — der
 * Server besitzt die Wahrheit und baut den finalen Markdown-Text aus
 * Section-Structs. Diese Datei hier spiegelt nur das, was im Frontend-
 * Draft gehalten wird.
 *
 * Wir duplizieren die Regex-Konstanten aus dem Server-File; eine
 * zentrale geteilte Datei lohnt nicht für eine reine Client-Read-only-
 * Parser-Funktion, die Round-Trip-Treue kommt vom Server.
 */

import type { DefaultsSection, DefaultsSectionCompanion } from '../../lib/types';

const AMOUNT_RE = /^[-*]?\s*(?:\*\*)?\s*(?:Menge|Dosis|Amount)\s*(?:\*\*)?\s*:\s*(.+?)\s*\**\s*$/i;
const NOTE_RE = /^[-*]?\s*(?:\*\*)?\s*(?:Notiz|Note|Hinweis)\s*(?:\*\*)?\s*:\s*(.+?)\s*$/i;
const COMPANION_RE = /^[-*]?\s*(?:\*\*)?\s*(?:Mit|Zusammen mit|With)\s*(?:\*\*)?\s*:\s*(.+?)\s*$/i;
const HEADING_RE = /^(#{2,6})\s+(.*)$/;

/** `Name | Menge | Notiz` → Companion. */
function parseCompanion(raw: string): DefaultsSectionCompanion | null {
  const parts = raw.split('|').map((p) => p.trim());
  const name = parts[0];
  if (!name) return null;
  return {
    name,
    amount: parts[1] || null,
    note: parts.slice(2).join(' | ').trim() || null,
  };
}

/**
 * Zerlegt Rohtext in Sektionen für die Initial-Befüllung des strukturierten
 * Editors. Spiegelt das Server-Pendant (`parseSections`), ist aber tolerant
 * gegenüber kleinen Drifts, weil die Server-Serialisierung die Wahrheit
 * baut.
 */
export function sectionsFromRaw(raw: string): DefaultsSection[] {
  const lines = raw.split(/\r?\n/);
  const headingIndices: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (HEADING_RE.test(lines[i])) headingIndices.push(i);
  }
  if (headingIndices.length === 0) return [];

  const sections: DefaultsSection[] = [];
  for (let i = 0; i < headingIndices.length; i++) {
    const start = headingIndices[i];
    const end = i + 1 < headingIndices.length ? headingIndices[i + 1] : lines.length;
    const headingLine = lines[start].match(HEADING_RE);
    if (!headingLine) continue;
    const name = headingLine[2].trim();

    let amount: string | null = null;
    let noteExplicit: string | null = null;
    const companions: DefaultsSectionCompanion[] = [];
    const preLines: string[] = [];
    const postLines: string[] = [];
    let structuredSeen = false;

    for (let j = start + 1; j < end; j++) {
      const line = lines[j];
      if (!line.trim()) continue;
      const a = line.match(AMOUNT_RE);
      if (a) {
        amount = a[1].trim();
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
      if (structuredSeen) postLines.push(line.trim());
      else preLines.push(line.trim());
    }

    sections.push({
      name,
      amount,
      note: noteExplicit?.trim() || null,
      companions,
      preLines,
      postLines,
    });
  }
  return sections;
}

/**
 * Tiefer Strukturgleichheitstest. Reicht für die "Speichern"-Button-
 * Enable-Logik; ignoriert React-Keys / undefined-Felder.
 */
export function sectionsEqual(a: DefaultsSection[], b: DefaultsSection[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const A = a[i];
    const B = b[i];
    if (
      A.name !== B.name ||
      (A.amount ?? '') !== (B.amount ?? '') ||
      (A.note ?? '') !== (B.note ?? '') ||
      A.companions.length !== B.companions.length ||
      A.preLines.length !== B.preLines.length ||
      A.postLines.length !== B.postLines.length
    ) {
      return false;
    }
    for (let j = 0; j < A.companions.length; j++) {
      const cA = A.companions[j];
      const cB = B.companions[j];
      if (
        cA.name !== cB.name ||
        (cA.amount ?? '') !== (cB.amount ?? '') ||
        (cA.note ?? '') !== (cB.note ?? '')
      ) {
        return false;
      }
    }
    for (let j = 0; j < A.preLines.length; j++) if (A.preLines[j] !== B.preLines[j]) return false;
    for (let j = 0; j < A.postLines.length; j++) if (A.postLines[j] !== B.postLines[j]) return false;
  }
  return true;
}
