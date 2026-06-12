import { toLocalISO } from './time.js';

/**
 * Freitext-Parser für `POST /api/intakes/text` — wandelt mehrzeiligen Text in
 * Einnahme-Einträge um. Format pro Zeile (siehe SAMPLES.md im Projekt-Root):
 *
 *   (DD.MM(.YYYY)) XX:XX: BB ZZ (AAA), YY ZZ (AAA) und YY ZZ (AAA)
 *   jetzt: BB ZZ (AAA)
 *   BB ZZ (AAA)
 *
 * Legende: BB = Substanz, ZZ = Menge, AAA = Notiz (in Klammern, optional).
 * Ohne Zeit oder mit `jetzt:` gilt die aktuelle Zeit; ohne Jahr das aktuelle
 * Jahr, ohne Datum der heutige Tag. Jede Zeile wird einzeln verarbeitet;
 * innerhalb einer Zeile trennen Kommas und „ und " die Einträge.
 *
 * Eine Zeile ist atomar: enthält sie auch nur einen unparsbaren Eintrag,
 * wird die GANZE Zeile als Fehler gemeldet (nichts daraus angelegt) — so
 * kann der Aufrufer die korrigierte Zeile gefahrlos erneut senden, ohne die
 * übrigen Einträge der Zeile zu duplizieren.
 */

export interface ParsedTextEntry {
  /** 1-basierte Zeilennummer im Eingabetext. */
  line: number;
  substanceName: string;
  /** Menge wie im Text angegeben; null = Standarddosis/DEFAULTS greifen. */
  amount: string | null;
  /** Notiz aus der Klammer; null = DEFAULTS-Notiz greift. */
  note: string | null;
  /** Lokale Wanduhrzeit "YYYY-MM-DDTHH:mm:ss". */
  takenAt: string;
}

export interface TextLineError {
  line: number;
  text: string;
  error: string;
}

export interface ParsedText {
  entries: ParsedTextEntry[];
  errors: TextLineError[];
  /** Anzahl nicht-leerer Zeilen im Eingabetext. */
  lineCount: number;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Kalender-echte Datumsprüfung (lehnt z. B. 31.02. ab). */
function isValidDate(year: number, month: number, day: number): boolean {
  const d = new Date(year, month - 1, day);
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
}

/**
 * Liest das optionale Zeit-Präfix einer Zeile: `jetzt:`, `DD.MM(.YYYY) HH:MM:`,
 * nur `HH:MM:` oder nur `DD.MM(.YYYY):`. Liefert den Einnahme-Zeitpunkt und
 * den Rest der Zeile (die Einträge). Ohne Präfix gilt `now`.
 */
function parsePrefix(line: string, now: Date): { takenAt: string; rest: string } {
  let rest = line;

  const jetzt = /^jetzt\s*:\s*/i.exec(rest);
  if (jetzt) return { takenAt: toLocalISO(now), rest: rest.slice(jetzt[0].length).trim() };

  // Optionales Datum "DD.MM", "DD.MM." oder "DD.MM.YYYY"
  let day: number | null = null;
  let month: number | null = null;
  let year: number | null = null;
  const dm = /^(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?\.?(?=[\s:]|$)\s*/.exec(rest);
  if (dm) {
    day = Number(dm[1]);
    month = Number(dm[2]);
    year = dm[3] ? Number(dm[3]) : now.getFullYear();
    if (!isValidDate(year, month, day)) {
      throw new Error(`Ungültiges Datum: „${dm[0].trim().replace(/:$/, '')}"`);
    }
    rest = rest.slice(dm[0].length);
  }

  // Optionale Uhrzeit "HH:MM" (Doppelpunkt danach optional)
  let hour: number | null = null;
  let minute: number | null = null;
  const tm = /^(\d{1,2}):(\d{2})(?=[\s:]|$)\s*/.exec(rest);
  if (tm) {
    hour = Number(tm[1]);
    minute = Number(tm[2]);
    if (hour > 23 || minute > 59) throw new Error(`Ungültige Uhrzeit: „${tm[1]}:${tm[2]}"`);
    rest = rest.slice(tm[0].length);
  }

  if (!dm && !tm) return { takenAt: toLocalISO(now), rest: rest.trim() };

  // Trenn-Doppelpunkt nach dem Präfix ("… 08:30: Einträge")
  if (rest.startsWith(':')) rest = rest.slice(1);

  const y = year ?? now.getFullYear();
  const mo = month ?? now.getMonth() + 1;
  const d = day ?? now.getDate();
  // Datum ohne Uhrzeit → aktuelle Uhrzeit an jenem Tag; explizite Zeit → :00 Sekunden
  const h = hour ?? now.getHours();
  const mi = minute ?? now.getMinutes();
  const sec = tm ? 0 : now.getSeconds();
  return {
    takenAt: `${y}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}:${pad(sec)}`,
    rest: rest.trim(),
  };
}

/**
 * Trennt die Eintrags-Liste einer Zeile an Kommas und „ und " — aber nur auf
 * Klammertiefe 0 (Notizen dürfen Kommas/und enthalten) und nicht bei
 * Dezimal-Kommas (Ziffer,Ziffer wie "0,5 ml").
 */
function splitEntries(s: string): string[] {
  const parts: string[] = [];
  let buf = '';
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    if (depth === 0) {
      if (ch === ',' && !(/\d/.test(s[i - 1] ?? '') && /\d/.test(s[i + 1] ?? ''))) {
        parts.push(buf);
        buf = '';
        continue;
      }
      if (/\s/.test(ch)) {
        const und = /^\s+und\s+/i.exec(s.slice(i));
        if (und) {
          parts.push(buf);
          buf = '';
          i += und[0].length - 1;
          continue;
        }
      }
    }
    buf += ch;
  }
  parts.push(buf);
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

const startsWithDigit = (token: string) => /^[\d½¼¾]/.test(token);

/**
 * Zerlegt einen Einzel-Eintrag "BB ZZ (AAA)" in Substanz, Menge, Notiz.
 * Die Menge beginnt beim ersten Token (ab Position 2), das mit einer Ziffer
 * anfängt — bei direkt aufeinanderfolgenden Zahl-Tokens beim letzten der
 * Folge, damit "Omega 3 500 mg" als Substanz „Omega 3" + Menge „500 mg"
 * gelesen wird. Ohne Zahl-Token gilt der ganze Eintrag als Substanzname
 * (Menge kommt dann aus Standarddosis/DEFAULTS).
 */
function parseSingleEntry(raw: string): { substanceName: string; amount: string | null; note: string | null } {
  let s = raw.trim();
  let note: string | null = null;

  // Notiz: ausbalancierte Klammergruppe am Ende des Eintrags
  if (s.endsWith(')')) {
    let depth = 0;
    for (let i = s.length - 1; i >= 0; i--) {
      const ch = s[i];
      if (ch === ')') depth++;
      else if (ch === '(') {
        depth--;
        if (depth === 0) {
          note = s.slice(i + 1, s.length - 1).trim() || null;
          s = s.slice(0, i).trim();
          break;
        }
      }
    }
  }

  const tokens = s.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) throw new Error(`„${raw.trim()}": Substanzname fehlt`);

  // Reine Mengen-Angaben ("300", "0,5" oder einzeln "300mg") sind kein Eintrag.
  const bareNumber = /^\d+([.,/]\d+)?$/;
  const numberWithUnit = /^\d+([.,/]\d+)?[a-zA-ZäöüÄÖÜß%µ]+$/;
  if (bareNumber.test(tokens[0]) || (tokens.length === 1 && numberWithUnit.test(tokens[0]))) {
    throw new Error(`„${raw.trim()}": Substanzname fehlt (Eintrag beginnt mit einer Menge)`);
  }

  let amountStart = -1;
  for (let i = 1; i < tokens.length; i++) {
    if (startsWithDigit(tokens[i])) {
      amountStart = i;
      break;
    }
  }
  while (amountStart >= 0 && amountStart + 1 < tokens.length && startsWithDigit(tokens[amountStart + 1])) {
    amountStart++;
  }

  const substanceName = (amountStart === -1 ? tokens : tokens.slice(0, amountStart)).join(' ');
  const amount = amountStart === -1 ? null : tokens.slice(amountStart).join(' ');
  return { substanceName, amount, note };
}

/** Parst den gesamten Freitext; pro Zeile entweder Einträge ODER ein Fehler. */
export function parseFreeText(text: string, now: Date = new Date()): ParsedText {
  const entries: ParsedTextEntry[] = [];
  const errors: TextLineError[] = [];
  let lineCount = 0;

  text.split(/\r?\n/).forEach((rawLine, idx) => {
    const line = idx + 1;
    const trimmed = rawLine.trim();
    if (!trimmed) return;
    lineCount++;
    try {
      const { takenAt, rest } = parsePrefix(trimmed, now);
      if (!rest) throw new Error('Keine Einträge in der Zeile gefunden');
      const parts = splitEntries(rest);
      if (parts.length === 0) throw new Error('Keine Einträge in der Zeile gefunden');
      const lineEntries = parts.map((part) => ({ line, takenAt, ...parseSingleEntry(part) }));
      entries.push(...lineEntries);
    } catch (e) {
      errors.push({ line, text: trimmed, error: (e as Error).message });
    }
  });

  return { entries, errors, lineCount };
}
