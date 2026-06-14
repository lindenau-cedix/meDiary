import { toLocalISO } from './time.js';
import { nameKey } from './names.js';

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
 * Menge und Substanz dürfen in BEIDER Reihenfolge stehen: „Pregabalin 100 mg"
 * ebenso wie „100mg Pregabalin" / „200 mg Lorazepam". Ein bereits bekannter
 * Substanzname (`knownKeys`) dient dabei als Trennung zwischen Menge und Notiz;
 * ist der Name noch unbekannt, wird ein führendes Mengen-Token als Menge und
 * der Rest als (neuer) Substanzname gelesen.
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

/** Relative Tagesangaben als Offset (in Tagen) zum heutigen Datum. */
const RELATIVE_DAYS: Record<string, number> = {
  vorgestern: -2,
  gestern: -1,
  heute: 0,
  morgen: 1,
  übermorgen: 2,
};

/**
 * Liest das optionale Zeit-Präfix einer Zeile und liefert Einnahme-Zeitpunkt
 * plus den Rest (die Einträge). Unterstützt wird, jeweils mit optionalem
 * Trenn-Doppelpunkt vor den Einträgen:
 *
 *  - `jetzt:` → aktuelle Zeit
 *  - Datum: `DD.MM`, `DD.MM.`, `DD.MM.YYYY` oder relativ
 *    (`heute`/`gestern`/`vorgestern`/`morgen`/`übermorgen`)
 *  - Uhrzeit: `HH:MM`, `HH:MM Uhr`, `HH.MM Uhr`, `HH Uhr` (nur Stunde),
 *    optional eingeleitet mit `um` (z. B. „um 20 Uhr")
 *  - Datum und Uhrzeit kombiniert (`12.06. 20 Uhr:`, `gestern 8:30 Uhr:`)
 *
 * Ohne Datum gilt der heutige Tag, ohne Jahr das aktuelle, ohne Uhrzeit die
 * aktuelle Uhrzeit (Datum-only) bzw. die explizit genannte. Ohne erkennbares
 * Präfix gilt `now` und die ganze Zeile sind Einträge.
 *
 * Die `Uhr`-Erkennung trennt Punkt-Zeiten von Datumsangaben: `8.30 Uhr` ist
 * eine Zeit (08:30), `12.06.` ein Datum — eine gepunktete Zahl direkt vor
 * `Uhr` wird daher nie als Datum gelesen.
 */
function parsePrefix(line: string, now: Date): { takenAt: string; rest: string } {
  let rest = line;

  const jetzt = /^jetzt\b[\s:]*/i.exec(rest);
  if (jetzt) return { takenAt: toLocalISO(now), rest: rest.slice(jetzt[0].length).trim() };

  let year = now.getFullYear();
  let month = now.getMonth() + 1;
  let day = now.getDate();
  let hasDate = false;

  // --- Datum: relativ (gestern/heute/…) ODER numerisch DD.MM(.YYYY) ---
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
    // Eine gepunktete Zahl direkt vor „Uhr" ist eine Uhrzeit, kein Datum.
    if (dm && !/^\s*uhr\b/i.test(rest.slice(dm[0].length))) {
      day = Number(dm[1]);
      month = Number(dm[2]);
      year = dm[3] ? Number(dm[3]) : now.getFullYear();
      if (!isValidDate(year, month, day)) {
        throw new Error(`Ungültiges Datum: „${dm[0].trim().replace(/[.:]+$/, '')}"`);
      }
      hasDate = true;
      rest = rest.slice(dm[0].length);
    }
  }

  // --- Uhrzeit: HH:MM (Uhr), HH.MM Uhr, HH Uhr — optional mit „um" ---
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
      throw new Error(`Ungültige Uhrzeit: „${timeMatch[0].trim()}"`);
    }
    hasTime = true;
    rest = timeStr.slice(timeMatch[0].length); // „um" und Datum-Trenner verworfen
  }

  if (!hasDate && !hasTime) return { takenAt: toLocalISO(now), rest: rest.trim() };

  // Ein bekräftigendes Tageszeit-Wort hinter der Zeit ("21 Uhr nachts:",
  // "8:30 morgens:", "gestern abend") ist Präfix-Residuum, keine Notiz —
  // zusammen mit dem optionalen Trenn-Doppelpunkt entfernen.
  rest = rest
    .replace(
      /^\s*(?:morgens?|vormittags?|mittags?|nachmittags?|abends?|nachts?|nacht|früh|frueh|tagsüber|tagsueber)\b/i,
      '',
    )
    .replace(/^\s*:?\s*/, '')
    .trim();

  // Datum ohne Uhrzeit → aktuelle Uhrzeit an jenem Tag; explizite Zeit → :00 Sek.
  const h = hasTime ? (hour as number) : now.getHours();
  const mi = hasTime ? (minute as number) : now.getMinutes();
  const sec = hasTime ? 0 : now.getSeconds();
  return {
    takenAt: `${year}-${pad(month)}-${pad(day)}T${pad(h)}:${pad(mi)}:${pad(sec)}`,
    rest,
  };
}

/**
 * Trennt die Eintrags-Liste einer Zeile an Kommas und „ und " — aber nur auf
 * Klammertiefe 0 (Notizen dürfen Kommas/und enthalten) und nicht bei
 * Dezimal-Kommas (Ziffer,Ziffer wie "0,5 ml").
 *
 * Kommas trennen immer; „ und " trennt nur, wenn der rechte Teil tatsächlich
 * wie ein neuer Eintrag beginnt (führende Menge oder bekannter Substanzname).
 * So bleibt „Lithium 600 mg morgens und abends" EIN Eintrag (Notiz
 * „morgens und abends"), während „Elvanse 30 mg und Lithium 600 mg" zwei
 * Einträge bleibt. (Erkennt der Parser den Substanznamen rechts nicht, weil er
 * neu ist, fällt „und X" in die Notiz — Klammern erzwingen die Trennung.)
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

  // „ und "-Segmente, die NICHT wie ein neuer Eintrag beginnen, gehören zur
  // Notiz des vorigen Eintrags und werden wieder angehängt.
  const parts: string[] = [];
  for (const seg of segs) {
    // Separator-Artefakte (führendes/abschließendes „und" aus „und X", „X und",
    // „und und X") sowie reine Satzzeichen-Segmente (".", "...", "?") verwerfen.
    const text = seg.text
      .trim()
      .replace(/^und\s+/i, '')
      .replace(/\s+und$/i, '')
      .trim();
    if (!text || /^und$/i.test(text)) continue;
    if (!/[\p{L}\p{N}]/u.test(text)) continue; // kein Buchstabe/Ziffer → kein Eintrag
    if (seg.sep === 'und' && parts.length > 0 && !looksLikeEntryStart(text, knownKeys)) {
      parts[parts.length - 1] = `${parts[parts.length - 1]} und ${text}`;
    } else {
      parts.push(text);
    }
  }
  return parts;
}

/**
 * Heuristik: Beginnt das Textstück einen eigenen Eintrag (für die Frage, ob
 * „ und " trennt)? Wahr, wenn es IRGENDWO eine Mengenangabe (Dosis) enthält
 * oder einen bekannten Substanznamen — sonst (z. B. „abends", „bei Bedarf",
 * „morgens und abends") ist es Notiz-Fortsetzung. Die Menge-irgendwo-Regel
 * fängt unbekannte Substanzen mit Menge-danach ein („Hustensaft 10 ml"), die
 * sonst als ganzer Eintrag in der Notiz verschwinden würden.
 */
function looksLikeEntryStart(seg: string, knownKeys: Set<string>): boolean {
  const tokens = seg.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  if (tokens.some(isAmountToken)) return true;
  return findKnownSpan(tokens, knownKeys) !== null;
}

const startsWithDigit = (token: string) => /^[\d½¼¾]/.test(token);

// Mess-Einheiten — sowohl direkt an einer Zahl geklebt ("100mg") als auch als
// eigenständiges Token ("200 mg" → das „mg").
const MEASURE_UNITS = 'mg|µg|mcg|ug|g|kg|ml|l|cl|dl|ie|iu|mmol|mol|%';
const MEASURE_UNIT = new RegExp(`^(?:${MEASURE_UNITS})$`, 'i');

// Zahl-Kern eines Mengen-Tokens: Ganzzahl/Dezimal "300"/"0,5", Bruch "1/2",
// Bereich "1-2" oder Unicode-Bruch "½/¼/¾". Eine Mess-Einheit darf direkt
// dahinter kleben ("100mg", "½mg", "0,5ml").
const NUMBER_CORE = '(?:\\d+(?:[.,/]\\d+)?(?:-\\d+(?:[.,/]\\d+)?)?|[½¼¾])';
const AMOUNT_TOKEN = new RegExp(`^${NUMBER_CORE}(?:${MEASURE_UNITS})?$`, 'i');

// Darreichungs-/Zähl-Wörter, die NACH einer Zahl eine Menge bilden
// ("2 Tabletten", "1/2 Tablette", "3 Tropfen", "20 Hub", "1 TL").
const DOSE_WORD =
  /^(?:tablette|tabletten|tab|tabs|tbl|tablet|tablets|kapsel|kapseln|kaps|kap|cap|caps|tropfen|trpf|gtt|stück|stücke|stk|sprühstoß|sprühstöße|sprühstösse|spruehstoss|pumpstoß|pumpstöße|hub|hübe|pille|pillen|dragee|dragees|drg|teelöffel|esslöffel|messlöffel|tl|el|msp|prise|prisen|beutel|sachet|sachets|ampulle|ampullen|amp|einheit|einheiten)$/i;

/**
 * Reines Mengen-Token: "300", "0,5", "1/2", "½", Bereich "1-2" oder
 * Zahl+Einheit "100mg" / Bruch+Einheit "½mg".
 */
function isAmountToken(token: string): boolean {
  return AMOUNT_TOKEN.test(token);
}

/** Eigenständiges Einheiten-Token nach einer Zahl: Mess-Einheit oder Dosis-Wort. */
const isUnitToken = (token: string) => MEASURE_UNIT.test(token) || DOSE_WORD.test(token);

// Adverbiale Notiz-Wörter (Tageszeit / Einnahme-Hinweis), die nie Bestandteil
// eines Substanznamens sind. Steht so ein Wort am ENDE eines (sonst unbekannten)
// Namens, gehört es in die Notiz: „Pregabalin morgens" → Name „Pregabalin",
// Notiz „morgens". Bei bekannten Namen erledigt das schon der Anker (Case 1).
const NOTE_WORD =
  /^(?:morgens?|vormittags?|mittags?|nachmittags?|abends?|nachts?|nacht|früh|frueh|spät|spaet|tagsüber|tagsueber|nüchtern|nuechtern)$/i;

/**
 * Trennt abschließende adverbiale Notiz-Wörter vom Namen ab. Bewahrt mindestens
 * ein Namens-Token (ein Eintrag aus nur Notiz-Wörtern bleibt unverändert).
 */
function peelTrailingNoteWords(name: string): { name: string; note: string | null } {
  const toks = name.split(/\s+/).filter(Boolean);
  let end = toks.length;
  while (end > 1 && NOTE_WORD.test(toks[end - 1])) end--;
  if (end === toks.length) return { name, note: null };
  return { name: toks.slice(0, end).join(' '), note: toks.slice(end).join(' ') || null };
}

/**
 * Länge der führenden Mengen-Token-Folge (Zahl-Tokens, dann Einheiten-Tokens);
 * 0 = keine Menge am Anfang. Damit lässt sich eine Menge am Anfang einer
 * Token-Folge von einer nachfolgenden Frei-Notiz trennen ("150 mg morgens" →
 * Menge "150 mg", Notiz "morgens").
 */
function leadingAmountRun(tokens: string[]): number {
  if (tokens.length === 0 || !isAmountToken(tokens[0])) return 0;
  let i = 1;
  while (i < tokens.length && isAmountToken(tokens[i])) i++;
  while (i < tokens.length && isUnitToken(tokens[i])) i++;
  return i;
}

/**
 * Erste maximale Mengen-Folge IRGENDWO in den Tokens (Zahl-Tokens, dann
 * Einheiten-Tokens) als {start, len} — oder null. Damit lässt sich eine Dosis
 * herausziehen, die hinter einem Beschreiber steht ("retard 450 mg" →
 * Menge "450 mg"; "morgens 150 mg" → Menge "150 mg").
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
 * True, wenn die Tokens GENAU eine Mengenangabe bilden — führende Mengen-Tokens,
 * gefolgt von optionalen Einheiten-Tokens, ohne Rest. "100mg" / "200 mg" /
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
 * True, wenn die Span-Tokens mit einer KLAREN Mengenangabe beginnen ("100mg …"
 * oder "200 mg …"). Solche Spannen sind keine echten Substanznamen, sondern
 * Altlasten des früheren Fehlverhaltens (die Menge landete im Namen, z. B. eine
 * Substanz „100mg Pregabalin"). Eine bloße Zahl am Anfang ("5 HTP", "Omega 3")
 * ist KEIN Mengen-Präfix.
 */
function isAmountLed(tokens: string[]): boolean {
  if (tokens.length === 0 || !isAmountToken(tokens[0])) return false;
  const gluedUnit = /[a-zA-ZäöüÄÖÜßµ%]/.test(tokens[0]); // "100mg"
  return gluedUnit || (tokens.length > 1 && isUnitToken(tokens[1])); // "200 mg …"
}

/**
 * Sucht die LÄNGSTE zusammenhängende Token-Folge, deren Name zu einer bereits
 * bekannten Substanz gehört (`knownKeys`, via `nameKey` normalisiert). Spannen,
 * die mit einer Mengenangabe beginnen ("100mg …"), werden übersprungen — so
 * gewinnt "Pregabalin" gegen eine evtl. vorhandene Altlast-Substanz
 * "100mg Pregabalin". Liefert {start, end} (inklusiv) oder null.
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
