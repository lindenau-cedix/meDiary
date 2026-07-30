import { toLocalISO } from './time.js';
import { nameKey } from './names.js';

/**
 * Free-text parser for `POST /api/intakes/text` — turns multi-line text into
 * intake entries. Format per line (see SAMPLES.md in the project root):
 *
 *   (DD.MM(.YYYY)) XX:XX: BB ZZ (AAA), YY ZZ (AAA) und YY ZZ (AAA)
 *   jetzt: BB ZZ (AAA)
 *   BB ZZ (AAA)
 *
 * Legend: BB = substance, ZZ = amount, AAA = note (in parens, optional).
 * Without a time or with `jetzt:` the current time applies; without a year
 * the current year; without a date today. Each line is processed on its own;
 * within a line, commas and "und" separate the entries.
 *
 * Amount and substance may appear in EITHER order: "Pregabalin 100 mg" as
 * well as "100mg Pregabalin" / "200 mg Lorazepam". An already-known substance
 * name (`knownKeys`) acts as the boundary between amount and note; if the
 * name is still unknown, a leading amount token is read as the amount and
 * the rest as a (new) substance name.
 *
 * A line is atomic: if it contains even one unparseable entry, the WHOLE
 * line is reported as an error (nothing is created from it) — so the caller
 * can safely resend the corrected line without duplicating the other entries
 * of that line.
 */

export interface ParsedTextEntry {
  /** 1-based line number in the input text. */
  line: number;
  substanceName: string;
  /** Amount as specified in the text; null = default dose / DEFAULTS apply. */
  amount: string | null;
  /** Note from the parentheses; null = DEFAULTS note applies. */
  note: string | null;
  /** Local wall-clock time "YYYY-MM-DDTHH:mm:ss". */
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
  /** Number of non-empty lines in the input text. */
  lineCount: number;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Calendar-true date check (rejects e.g. 2026-02-31). */
function isValidDate(year: number, month: number, day: number): boolean {
  const d = new Date(year, month - 1, day);
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
}

/** Relative day expressions as offset (in days) from today. */
const RELATIVE_DAYS: Record<string, number> = {
  vorgestern: -2,
  gestern: -1,
  heute: 0,
  morgen: 1,
  übermorgen: 2,
};

/**
 * Reads the optional time prefix of a line and returns the intake timestamp
 * plus the remainder (the entries). Each of the following is supported, with
 * an optional separating colon before the entries:
 *
 *  - `jetzt:` → current time
 *  - Date: `DD.MM`, `DD.MM.`, `DD.MM.YYYY`, or relative
 *    (`heute`/`gestern`/`vorgestern`/`morgen`/`übermorgen`)
 *  - Time: `HH:MM`, `HH:MM Uhr`, `HH.MM Uhr`, `HH Uhr` (hour only),
 *    optionally introduced with `um` (e.g. "um 20 Uhr")
 *  - Date and time combined (`12.06. 20 Uhr:`, `gestern 8:30 Uhr:`)
 *
 * Without a date, today applies; without a year, the current year; without a
 * time, the current time (date-only) or the explicitly stated time. Without
 * any recognizable prefix, `now` applies and the whole line is entries.
 *
 * The `Uhr` recognition separates dotted times from dates: `8.30 Uhr` is a
 * time (08:30), `12.06.` is a date — a dotted number immediately before
 * `Uhr` is therefore never read as a date.
 */
function parsePrefix(line: string, now: Date): { takenAt: string; rest: string } {
  let rest = line;

  const jetzt = /^jetzt\b[\s:]*/i.exec(rest);
  if (jetzt) return { takenAt: toLocalISO(now), rest: rest.slice(jetzt[0].length).trim() };

  let year = now.getFullYear();
  let month = now.getMonth() + 1;
  let day = now.getDate();
  let hasDate = false;

  // --- Date: relative (gestern/heute/…) OR numeric DD.MM(.YYYY) ---
  const rel = /^(vorgestern|gestern|heute|übermorgen|morgen)\b[\s:]*/i.exec(rest);
  if (rel) {
    const offset = RELATIVE_DAYS[rel[1].toLocaleLowerCase('de')];
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    year = d.getFullYear();
    month = d.getMonth() + 1;
    day = d.getDate();
    hasDate = true;
    rest = rest.slice(rel[0].length);
  } else {
    const dm = /^(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?\.?(?=[\s:]|$)/.exec(rest);
    // A dotted number directly before "Uhr" is a time, not a date.
    if (dm && !/^\s*uhr\b/i.test(rest.slice(dm[0].length))) {
      day = Number(dm[1]);
      month = Number(dm[2]);
      year = dm[3] ? Number(dm[3]) : now.getFullYear();
      if (!isValidDate(year, month, day)) {
        throw new Error(`Invalid date: "${dm[0].trim().replace(/[.:]+$/, '')}"`);
      }
      hasDate = true;
      rest = rest.slice(dm[0].length);
    }
  }

  // --- Time: HH:MM (Uhr), HH.MM Uhr, HH Uhr — optionally preceded by "um" ---
  const afterDate = rest.replace(/^\s*/, '');
  const um = /^um\s+/i.exec(afterDate);
  const timeStr = um ? afterDate.slice(um[0].length) : afterDate;

  let hour: number | null = null;
  let minute: number | null = null;
  let timeMatch: RegExpExecArray | null = null;
  if ((timeMatch = /^(\d{1,2}):(\d{2})\s*uhr\b/i.exec(timeStr))) {
    hour = Number(timeMatch[1]);
    minute = Number(timeMatch[2]);
  } else if ((timeMatch = /^(\d{1,2})\.(\d{2})\s*uhr\b/i.exec(timeStr))) {
    hour = Number(timeMatch[1]);
    minute = Number(timeMatch[2]);
  } else if ((timeMatch = /^(\d{1,2})\s*uhr\b/i.exec(timeStr))) {
    hour = Number(timeMatch[1]);
    minute = 0;
  } else if ((timeMatch = /^(\d{1,2}):(\d{2})(?=[\s:]|$)/.exec(timeStr))) {
    hour = Number(timeMatch[1]);
    minute = Number(timeMatch[2]);
  }

  let hasTime = false;
  if (timeMatch && hour !== null) {
    if (hour > 23 || (minute ?? 0) > 59) {
      throw new Error(`Invalid time: "${timeMatch[0].trim()}"`);
    }
    hasTime = true;
    rest = timeStr.slice(timeMatch[0].length); // "um" and date separator discarded
  }

  if (!hasDate && !hasTime) return { takenAt: toLocalISO(now), rest: rest.trim() };

  // A corroborative time-of-day word after the time ("21 Uhr nachts:",
  // "8:30 morgens:", "gestern abend") is prefix residue, not a note —
  // remove along with the optional separating colon.
  rest = rest
    .replace(
      /^\s*(?:morgens?|vormittags?|mittags?|nachmittags?|abends?|nachts?|nacht|früh|frueh|tagsüber|tagsueber)\b/i,
      '',
    )
    .replace(/^\s*:?\s*/, '')
    .trim();

  // Date without time → current time of that day; explicit time → :00 seconds.
  const h = hasTime ? (hour as number) : now.getHours();
  const mi = hasTime ? (minute as number) : now.getMinutes();
  const sec = hasTime ? 0 : now.getSeconds();
  return {
    takenAt: `${year}-${pad(month)}-${pad(day)}T${pad(h)}:${pad(mi)}:${pad(sec)}`,
    rest,
  };
}

/**
 * Splits the entry list of a line at commas and "und" — but only at
 * parenthesis depth 0 (notes may contain commas/"und") and not at decimal
 * commas (digit,digit like "0,5 ml").
 *
 * Commas always split; "und" only splits when the right side actually starts
 * like a new entry (leading amount or a known substance name). That way
 * "Lithium 600 mg morgens und abends" stays ONE entry (note
 * "morgens und abends"), while "Elvanse 30 mg und Lithium 600 mg" stays
 * two entries. (If the parser does not recognise the substance name on the
 * right because it is new, "und X" falls into the note — parentheses force
 * the split.)
 */
function splitEntries(s: string, knownKeys: Set<string>): string[] {
  type Seg = { sep: 'start' | 'comma' | 'und'; text: string };
  const segs: Seg[] = [];
  let buf = '';
  let depth = 0;
  let sep: Seg['sep'] = 'start';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    if (depth === 0) {
      if (ch === ',' && !(/\d/.test(s[i - 1] ?? '') && /\d/.test(s[i + 1] ?? ''))) {
        segs.push({ sep, text: buf });
        buf = '';
        sep = 'comma';
        continue;
      }
      if (/\s/.test(ch)) {
        const und = /^\s+und\s+/i.exec(s.slice(i));
        if (und) {
          segs.push({ sep, text: buf });
          buf = '';
          sep = 'und';
          i += und[0].length - 1;
          continue;
        }
      }
    }
    buf += ch;
  }
  segs.push({ sep, text: buf });

  // "und"-segments that do NOT start like a new entry belong to the previous
  // entry's note and are appended again.
  const parts: string[] = [];
  for (const seg of segs) {
    // Discard separator artefacts (leading/trailing "und" from "und X",
    // "X und", "und und X") and pure-punctuation segments (".", "...", "?").
    const text = seg.text
      .trim()
      .replace(/^und\s+/i, '')
      .replace(/\s+und$/i, '')
      .trim();
    if (!text || /^und$/i.test(text)) continue;
    if (!/[\p{L}\p{N}]/u.test(text)) continue; // no letter/digit → no entry
    if (seg.sep === 'und' && parts.length > 0 && !looksLikeEntryStart(text, knownKeys)) {
      parts[parts.length - 1] = `${parts[parts.length - 1]} und ${text}`;
    } else {
      parts.push(text);
    }
  }
  return parts;
}

/**
 * Heuristic: Does the text fragment start its own entry (the question of
 * whether "und" splits)? True if it contains an amount (dose) ANYWHERE or
 * a known substance name — otherwise (e.g. "abends", "bei Bedarf",
 * "morgens und abends") it is note continuation. The "amount anywhere" rule
 * catches unknown substances with amount-after ("Hustensaft 10 ml") that
 * would otherwise vanish into the note as a whole entry.
 */
function looksLikeEntryStart(seg: string, knownKeys: Set<string>): boolean {
  const tokens = seg.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  if (tokens.some(isAmountToken)) return true;
  return findKnownSpan(tokens, knownKeys) !== null;
}

const startsWithDigit = (token: string) => /^[\d½¼¾]/.test(token);

// Measurement units — either glued directly to a number ("100mg") or as a
// standalone token ("200 mg" → the "mg").
const MEASURE_UNITS = 'mg|µg|mcg|ug|g|kg|ml|l|cl|dl|ie|iu|mmol|mol|%';
const MEASURE_UNIT = new RegExp(`^(?:${MEASURE_UNITS})$`, 'i');

// Number core of an amount token: integer/decimal "300"/"0,5", fraction "1/2",
// range "1-2", or Unicode fraction "½/¼/¾". A measurement unit may be glued
// directly behind ("100mg", "½mg", "0,5ml").
const NUMBER_CORE = '(?:\\d+(?:[.,/]\\d+)?(?:-\\d+(?:[.,/]\\d+)?)?|[½¼¾])';
const AMOUNT_TOKEN = new RegExp(`^${NUMBER_CORE}(?:${MEASURE_UNITS})?$`, 'i');

// Dosage/count words that, AFTER a number, form an amount
// ("2 Tabletten", "1/2 Tablette", "3 Tropfen", "20 Hub", "1 TL").
const DOSE_WORD =
  /^(?:tablette|tabletten|tab|tabs|tbl|tablet|tablets|kapsel|kapseln|kaps|kap|cap|caps|tropfen|trpf|gtt|stück|stücke|stk|sprühstoß|sprühstöße|sprühstösse|spruehstoss|pumpstoß|pumpstöße|hub|hübe|pille|pillen|dragee|dragees|drg|teelöffel|esslöffel|messlöffel|tl|el|msp|prise|prisen|beutel|sachet|sachets|ampulle|ampullen|amp|einheit|einheiten)$/i;

/**
 * Pure amount token: "300", "0,5", "1/2", "½", range "1-2", or
 * number+unit "100mg" / fraction+unit "½mg".
 */
function isAmountToken(token: string): boolean {
  return AMOUNT_TOKEN.test(token);
}

/** Standalone unit token after a number: measurement unit or dose word. */
const isUnitToken = (token: string) => MEASURE_UNIT.test(token) || DOSE_WORD.test(token);

// Adverbial note words (time of day / intake hint) that never belong to a
// substance name. If such a word appears at the END of an (otherwise
// unknown) name, it goes into the note: "Pregabalin morgens" → name
// "Pregabalin", note "morgens". For known names the anchor (Case 1) handles
// this already.
const NOTE_WORD =
  /^(?:morgens?|vormittags?|mittags?|nachmittags?|abends?|nachts?|nacht|früh|frueh|spät|spaet|tagsüber|tagsueber|nüchtern|nuechtern)$/i;

/**
 * Strips trailing adverbial note words off the name. Preserves at least one
 * name token (an entry made of only note words is left unchanged).
 */
function peelTrailingNoteWords(name: string): { name: string; note: string | null } {
  const toks = name.split(/\s+/).filter(Boolean);
  let end = toks.length;
  while (end > 1 && NOTE_WORD.test(toks[end - 1])) end--;
  if (end === toks.length) return { name, note: null };
  return { name: toks.slice(0, end).join(' '), note: toks.slice(end).join(' ') || null };
}

/**
 * Length of the leading amount-token run (number tokens, then unit tokens);
 * 0 = no amount at the start. Lets us separate an amount at the start of a
 * token sequence from a trailing free-text note ("150 mg morgens" →
 * amount "150 mg", note "morgens").
 */
function leadingAmountRun(tokens: string[]): number {
  if (tokens.length === 0 || !isAmountToken(tokens[0])) return 0;
  let i = 1;
  while (i < tokens.length && isAmountToken(tokens[i])) i++;
  while (i < tokens.length && isUnitToken(tokens[i])) i++;
  return i;
}

/**
 * First maximal amount run ANYWHERE in the tokens (number tokens, then
 * unit tokens) as {start, len} — or null. Lets us pull out a dose that
 * stands behind a descriptor ("retard 450 mg" → amount "450 mg";
 * "morgens 150 mg" → amount "150 mg").
 */
function findAmountRun(tokens: string[]): { start: number; len: number } | null {
  for (let i = 0; i < tokens.length; i++) {
    if (!isAmountToken(tokens[i])) continue;
    let j = i + 1;
    while (j < tokens.length && isAmountToken(tokens[j])) j++;
    while (j < tokens.length && isUnitToken(tokens[j])) j++;
    return { start: i, len: j - i };
  }
  return null;
}

/**
 * True if the tokens form EXACTLY one amount — leading amount tokens,
 * followed by optional unit tokens, with no remainder. "100mg" / "200 mg" /
 * "0,5 ml" / "500 mg" ✓ — "nüchtern" / "3 HTP" ✗.
 */
function isQuantityRun(tokens: string[]): boolean {
  if (tokens.length === 0 || !isAmountToken(tokens[0])) return false;
  let i = 1;
  while (i < tokens.length && isAmountToken(tokens[i])) i++;
  while (i < tokens.length && isUnitToken(tokens[i])) i++;
  return i === tokens.length;
}

/**
 * True if the span tokens start with a CLEAR amount ("100mg …" or
 * "200 mg …"). Such spans are not real substance names but legacy
 * artefacts of an earlier misbehaviour (the amount ended up in the name,
 * e.g. a substance "100mg Pregabalin"). A bare number at the start
 * ("5 HTP", "Omega 3") is NOT an amount prefix.
 */
function isAmountLed(tokens: string[]): boolean {
  if (tokens.length === 0 || !isAmountToken(tokens[0])) return false;
  const gluedUnit = /[a-zA-ZäöüÄÖÜßµ%]/.test(tokens[0]); // "100mg"
  return gluedUnit || (tokens.length > 1 && isUnitToken(tokens[1])); // "200 mg …"
}

/**
 * Finds the LONGEST contiguous token span whose name belongs to a known
 * substance (`knownKeys`, normalized via `nameKey`). Spans that start with
 * an amount ("100mg …") are skipped — so "Pregabalin" wins over a possible
 * legacy substance "100mg Pregabalin". Returns {start, end} (inclusive) or
 * null.
 */
function findKnownSpan(tokens: string[], knownKeys: Set<string>): { start: number; end: number } | null {
  if (knownKeys.size === 0) return null;
  let best: { start: number; end: number } | null = null;
  for (let i = 0; i < tokens.length; i++) {
    for (let j = i; j < tokens.length; j++) {
      const span = tokens.slice(i, j + 1);
      if (isAmountLed(span)) continue;
      if (!knownKeys.has(nameKey(span.join(' ')))) continue;
      const len = j - i + 1;
      if (!best || len > best.end - best.start + 1 || (len === best.end - best.start + 1 && i < best.start)) {
        best = { start: i, end: j };
      }
    }
  }
  return best;
}

/**
 * Zerlegt einen Einzel-Eintrag in Substanz, Menge, Notiz. Die Notiz steht in
 * Klammern am Ende des Eintrags. Substanz/Menge werden — in dieser Reihenfolge —
 * so erkannt:
 *
 *  1. **Bekannter Substanzname als Trennung:** kommt im Eintrag ein bereits
 *     bekannter Substanzname vor (`knownKeys`), markiert er die Grenze zwischen
 *     Menge und Notiz. Die Menge darf DAVOR ("100mg Pregabalin") oder DANACH
 *     ("Pregabalin 100mg") stehen; Text hinter dem Namen ohne Zahl wird zur
 *     Notiz ("Pregabalin nüchtern").
 *  2. **Menge-zuerst:** beginnt der Eintrag mit einer Mengenangabe MIT Einheit
 *     ("200 mg Lorazepam", "100mg Pregabalin"), gilt sie als Menge und der Rest
 *     als (ggf. neuer) Substanzname — auch ohne bekannten Namen.
 *  3. **Substanz-zuerst** (Standard): die Menge beginnt beim ersten Zahl-Token
 *     nach dem Namen, bei Zahl-Folgen ("Omega 3 500 mg") beim letzten der Folge.
 *     Eine führende einheitenlose Zahl ("300 Baldrian") gilt als Menge.
 *
 * Ohne Mengenangabe bleibt `amount = null` (Standarddosis/DEFAULTS greifen).
 */
function parseSingleEntry(
  raw: string,
  knownKeys: Set<string>,
): { substanceName: string; amount: string | null; note: string | null } {
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

  // Schutz gegen mengen-only Einträge ("300mg", "200 mg", "0,5"): bleibt nach
  // der Mengen-Erkennung kein echter Name übrig, ist die Zeile fehlerhaft.
  // Abschließende adverbiale Notiz-Wörter („Pregabalin morgens") wandern in die
  // Notiz — wichtig für noch unbekannte Substanzen ohne Anker (Case 1).
  const finalize = (substanceName: string, amount: string | null, n: string | null) => {
    const peeled = peelTrailingNoteWords(substanceName);
    const nameTokens = peeled.name.split(/\s+/).filter(Boolean);
    if (nameTokens.length === 0 || isQuantityRun(nameTokens)) {
      throw new Error(`„${raw.trim()}": Substanzname fehlt (Eintrag beginnt mit einer Menge)`);
    }
    const note = [peeled.note, n].filter(Boolean).join(' ').trim() || null;
    return { substanceName: peeled.name, amount, note };
  };

  // (1) Bekannter Substanzname als Anker: Menge davor ODER dahinter (auch hinter
  // einem Beschreiber wie „retard"/„morgens"), restlicher Frei-Text → Notiz.
  const span = findKnownSpan(tokens, knownKeys);
  if (span) {
    const before = tokens.slice(0, span.start);
    const after = tokens.slice(span.end + 1);
    const substanceName = tokens.slice(span.start, span.end + 1).join(' ');
    let amount: string | null = null;
    const noteParts: string[] = [];
    // Menge bevorzugt vor dem Namen, sonst dahinter — jeweils an beliebiger
    // Stelle der Seite; die umliegenden Wörter werden zur Notiz.
    const placeAmount = (side: string[]) => {
      const run = amount === null ? findAmountRun(side) : null;
      if (run) {
        amount = side.slice(run.start, run.start + run.len).join(' ');
        noteParts.push(side.slice(0, run.start).join(' '), side.slice(run.start + run.len).join(' '));
      } else {
        noteParts.push(side.join(' '));
      }
    };
    placeAmount(before);
    placeAmount(after);
    const freeNote = noteParts.filter(Boolean).join(' ').trim() || null;
    // Frei-Notiz (vor/hinter dem Namen) + Klammer-Notiz beide bewahren.
    const combined = [freeNote, note].filter(Boolean).join(' ').trim() || null;
    return { substanceName, amount, note: combined };
  }

  // (2) Menge-zuerst: der Eintrag beginnt mit einer Mengenangabe MIT Einheit
  // ("100mg Pregabalin", "200 mg Lorazepam", "0,5 ml CBD-Öl"). Die Einheit ist
  // bewusst Voraussetzung — eine bloße führende Zahl ("5 HTP 100mg") gehört
  // sonst evtl. zum Namen und wird in (3) behandelt.
  if (isAmountLed(tokens)) {
    let k = 1;
    while (k < tokens.length && isAmountToken(tokens[k])) k++;
    while (k < tokens.length && isUnitToken(tokens[k])) k++;
    return finalize(tokens.slice(k).join(' '), tokens.slice(0, k).join(' '), note);
  }

  // (3) Substanz-zuerst (Standard): Menge ab dem ersten Zahl-Token nach dem Namen,
  // bei Zahl-Folgen ("Omega 3 500 mg") ab dem letzten der Folge.
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

  // Fand sich keine Menge nach dem Namen, der Eintrag beginnt aber mit einer
  // bloßen Zahl ohne Einheit ("300 Baldrian") → diese Zahl ist die Menge.
  if (amountStart === -1 && isAmountToken(tokens[0]) && tokens.length > 1) {
    let k = 1;
    while (k < tokens.length && isAmountToken(tokens[k])) k++;
    return finalize(tokens.slice(k).join(' '), tokens.slice(0, k).join(' '), note);
  }

  if (amountStart === -1) return finalize(tokens.join(' '), null, note);

  // Menge ab `amountStart`; eine evtl. folgende Frei-Notiz ("150 mg morgens")
  // hinter der Mengen-Folge abtrennen, statt sie gierig in die Menge zu ziehen.
  const substanceName = tokens.slice(0, amountStart).join(' ');
  const tail = tokens.slice(amountStart);
  const runLen = leadingAmountRun(tail);
  if (runLen > 0 && runLen < tail.length) {
    const amount = tail.slice(0, runLen).join(' ');
    const restNote = tail.slice(runLen).join(' ');
    // Frei-Notiz hinter der Menge + evtl. Klammer-Notiz beide bewahren.
    return finalize(substanceName, amount, [restNote, note].filter(Boolean).join(' ').trim() || null);
  }
  return finalize(substanceName, tail.join(' '), note);
}

/**
 * Parst den gesamten Freitext; pro Zeile entweder Einträge ODER ein Fehler.
 *
 * `knownKeys` ist die Menge der bereits bekannten Substanznamen (via `nameKey`
 * normalisiert) — sie dient als Trennung zwischen Menge und Notiz (siehe
 * `parseSingleEntry`). Leer = nur die Heuristiken (Menge-zuerst / Substanz-
 * zuerst); der Parser bleibt dadurch DB-frei und für sich testbar.
 */
export function parseFreeText(
  text: string,
  now: Date = new Date(),
  knownKeys: Set<string> = new Set(),
): ParsedText {
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
      const parts = splitEntries(rest, knownKeys);
      if (parts.length === 0) throw new Error('Keine Einträge in der Zeile gefunden');
      const lineEntries = parts.map((part) => ({ line, takenAt, ...parseSingleEntry(part, knownKeys) }));
      entries.push(...lineEntries);
    } catch (e) {
      errors.push({ line, text: trimmed, error: (e as Error).message });
    }
  });

  return { entries, errors, lineCount };
}
