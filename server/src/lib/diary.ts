import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { db, type IntakeRow, type AssessmentRow } from '../db.js';
import { consumptionDay } from './time.js';
import { METRICS } from './metrics.js';
import { generateText, anthropicAvailable, anthropicModel } from './anthropic.js';

/**
 * Tagebuch-Logik. Zwei Sichten auf die Notizen, die NIE die DB verändern:
 *
 *  1. Kurzversion (`gatherDiaryDays` → Route /api/diary/notes): eine reine
 *     Liste der Notizen (Einnahme-Notizen + Tagesbild-Notiz) je Konsum-Tag.
 *  2. Vollversion: pro Tag ein KI-generierter Fließtext, geführt in einer
 *     separaten Markdown-Datei (`config.diaryPath`). Die DB-Notizen bleiben
 *     unberührt; regeneriert wird nur die .md.
 *
 * Konsum-Tag = `consumptionDay(taken_at)` (03:30-Tagesgrenze, Europe/Berlin) —
 * konsistent mit `intake.date` und dem Tagesbild.
 */

export interface DiaryIntakeEntry {
  id: number;
  takenAt: string;
  time: string; // HH:MM
  substanceName: string;
  amount: string | null;
  note: string | null;
}

export interface DiaryDayAssessment {
  scores: Record<string, number>;
  note: string | null;
}

export interface DiaryDay {
  date: string;
  weekday: string; // "Donnerstag"
  label: string; // "Donnerstag, 12. Juni 2026"
  intakes: DiaryIntakeEntry[];
  assessment: DiaryDayAssessment | null;
}

/** Ein generierter Voll-Eintrag aus der .md-Datei. */
export interface DiaryEntry {
  date: string;
  heading: string;
  body: string;
}

const METRIC_LABEL = new Map(METRICS.map((m) => [m.key, m.label]));

// ── Datumsformat (Europe/Berlin, deutsche Bezeichner) ──
const weekdayFmt = new Intl.DateTimeFormat('de-DE', { weekday: 'long' });
const longFmt = new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
function dayDate(date: string): Date {
  // 12:00 Mittag → robust gegen Sommer-/Winterzeit-Ränder.
  return new Date(`${date}T12:00:00`);
}

// ───────────────────────── Daten sammeln ─────────────────────────

/**
 * Alle Konsum-Tage mit Inhalt (mindestens eine Einnahme-Notiz, oder ein
 * Tagesbild). Jeder Tag trägt ALLE Einnahmen des Tages (Kontext für die
 * KI-Generierung) — die Kurzversion-Route filtert auf Notiz-tragende.
 * Absteigend sortiert (neuester Tag zuerst). `from`/`to` (YYYY-MM-DD) grenzen ein.
 */
export function gatherDiaryDays(opts?: { from?: string; to?: string }): DiaryDay[] {
  const from = opts?.from?.slice(0, 10);
  const to = opts?.to?.slice(0, 10);

  const intakes = db
    .prepare(`SELECT * FROM intakes ORDER BY taken_at ASC, id ASC`)
    .all() as IntakeRow[];
  const assessments = db.prepare(`SELECT * FROM daily_assessments`).all() as AssessmentRow[];

  const byDate = new Map<string, DiaryDay>();
  const ensure = (date: string): DiaryDay => {
    let d = byDate.get(date);
    if (!d) {
      d = {
        date,
        weekday: weekdayFmt.format(dayDate(date)),
        label: longFmt.format(dayDate(date)),
        intakes: [],
        assessment: null,
      };
      byDate.set(date, d);
    }
    return d;
  };

  for (const it of intakes) {
    const date = consumptionDay(it.taken_at);
    ensure(date).intakes.push({
      id: it.id,
      takenAt: it.taken_at,
      time: it.taken_at.slice(11, 16),
      substanceName: it.substance_name,
      amount: it.amount,
      note: it.notes && it.notes.trim() ? it.notes.trim() : null,
    });
  }

  for (const a of assessments) {
    let scores: Record<string, number> = {};
    try {
      scores = JSON.parse(a.scores);
    } catch {
      scores = {};
    }
    const clean: Record<string, number> = {};
    for (const m of METRICS) if (typeof scores[m.key] === 'number') clean[m.key] = scores[m.key];
    const note = a.note && a.note.trim() ? a.note.trim() : null;
    if (Object.keys(clean).length === 0 && !note) continue;
    ensure(a.date).assessment = { scores: clean, note };
  }

  let days = [...byDate.values()];
  // „Inhalt" = mind. eine Einnahme-Notiz ODER ein Tagesbild (Werte/Notiz).
  days = days.filter((d) => d.intakes.some((i) => i.note) || d.assessment !== null);
  if (from) days = days.filter((d) => d.date >= from);
  if (to) days = days.filter((d) => d.date <= to);
  days.sort((a, b) => (a.date < b.date ? 1 : -1));
  return days;
}

// ───────────────────────── .md lesen / schreiben ─────────────────────────

const DAY_MARKER = /<!--\s*meDiary:day\s+(\d{4}-\d{2}-\d{2})\s*-->/;
const DAY_MARKER_G = /<!--\s*meDiary:day\s+(\d{4}-\d{2}-\d{2})\s*-->/g;
const GENERATED_MARKER = /<!--\s*meDiary:generated\s+([^\s]+)\s*-->/;
const DIARY_TITLE = '# meDiary — Tagebuch';

export function readDiaryRaw(): string {
  try {
    return fs.readFileSync(config.diaryPath, 'utf8');
  } catch {
    return '';
  }
}

export function writeDiaryRaw(content: string): void {
  // Elternverzeichnis sicherstellen (analog zu db.ts für die DB) — ein
  // benutzerdefinierter DIARY_PATH in ein noch nicht existierendes Verzeichnis
  // darf nicht crashen.
  fs.mkdirSync(path.dirname(config.diaryPath), { recursive: true });
  fs.writeFileSync(config.diaryPath, content, 'utf8');
}

/** Zeitpunkt der letzten Generierung aus dem Header-Marker (oder null). */
export function lastGeneratedAt(raw = readDiaryRaw()): string | null {
  const m = raw.match(GENERATED_MARKER);
  return m ? m[1] : null;
}

/** Zerlegt die .md in pro-Tag-Einträge (über die `meDiary:day`-Marker). */
export function parseDiaryEntries(raw = readDiaryRaw()): DiaryEntry[] {
  const out: DiaryEntry[] = [];
  const matches = [...raw.matchAll(DAY_MARKER_G)];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const date = m[1];
    const start = m.index! + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index! : raw.length;
    const block = raw.slice(start, end).trim();
    const lines = block.split(/\r?\n/);
    let heading = '';
    let bodyStart = 0;
    // erste „## …"-Zeile ist die Überschrift
    for (let l = 0; l < lines.length; l++) {
      const h = lines[l].match(/^##\s+(.*)$/);
      if (h) {
        heading = h[1].trim();
        bodyStart = l + 1;
        break;
      }
      if (lines[l].trim()) break; // Inhalt vor Überschrift → keine Überschrift
    }
    const body = lines.slice(bodyStart).join('\n').trim();
    out.push({ date, heading, body });
  }
  // neueste zuerst
  out.sort((a, b) => (a.date < b.date ? 1 : -1));
  return out;
}

/** Baut die komplette .md aus Einträgen (neueste zuerst). */
export function assembleDiary(entries: DiaryEntry[], generatedAt: string): string {
  const ordered = [...entries].sort((a, b) => (a.date < b.date ? 1 : -1));
  const parts: string[] = [
    DIARY_TITLE,
    '',
    '> Automatisch aus den Notizen der Einnahmen und Tagesbilder generiert.',
    '> Manuelle Änderungen bleiben erhalten, solange du nicht „Alles neu generieren" wählst.',
    '',
    `<!-- meDiary:generated ${generatedAt} -->`,
    '',
  ];
  for (const e of ordered) {
    parts.push(`<!-- meDiary:day ${e.date} -->`);
    parts.push(`## ${e.heading}`);
    parts.push('');
    parts.push(e.body);
    parts.push('');
  }
  return parts.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

// ───────────────────────── KI-Generierung ─────────────────────────

const SYSTEM_PROMPT = [
  'Du bist ein Assistent, der aus stichpunktartigen Notizen eines',
  'Medikations-Tagebuchs einen kurzen, zusammenhängenden Tagebucheintrag in',
  'der Ich-Form auf Deutsch schreibt.',
  '',
  'Regeln:',
  '- Schreibe ausschließlich auf Basis der gelieferten Fakten. Erfinde nichts',
  '  hinzu, deute keine Diagnosen, gib keine medizinischen Ratschläge.',
  '- Nenne die eingenommenen Substanzen und Beobachtungen natürlich im Fließtext.',
  '- Ein bis zwei kurze Absätze, ca. 60–160 Wörter. Sachlich-ruhiger Ton.',
  '- Gib NUR den Fließtext zurück — keine Überschrift, keine Aufzählungspunkte,',
  '  keine Anrede, keine Meta-Kommentare.',
].join('\n');

function buildDayPrompt(day: DiaryDay): string {
  const lines: string[] = [`Datum: ${day.label}`, ''];
  if (day.intakes.length) {
    lines.push('Einnahmen:');
    for (const it of day.intakes) {
      const parts = [`${it.time}`, it.substanceName];
      if (it.amount) parts.push(it.amount);
      let line = `- ${parts.join(' ')}`;
      if (it.note) line += ` — ${it.note}`;
      lines.push(line);
    }
    lines.push('');
  }
  if (day.assessment) {
    const scoreKeys = Object.keys(day.assessment.scores);
    if (scoreKeys.length) {
      lines.push('Tagesbild (Skala 1–10):');
      for (const m of METRICS) {
        const v = day.assessment.scores[m.key];
        if (typeof v === 'number') lines.push(`- ${METRIC_LABEL.get(m.key) ?? m.key}: ${v}`);
      }
      lines.push('');
    }
    if (day.assessment.note) {
      lines.push(`Tagesnotiz: ${day.assessment.note}`);
      lines.push('');
    }
  }
  lines.push('Schreibe daraus einen Tagebucheintrag für diesen Tag.');
  return lines.join('\n');
}

export interface DiaryGenerateResult {
  generated: number;
  skippedExisting: number;
  pendingDays: string[]; // noteworthy Tage, die (wegen max) noch nicht generiert wurden
  errors: { date: string; error: string }[];
  raw: string;
}

/**
 * Generiert (oder regeneriert) Tagebuch-Einträge und schreibt die .md.
 *  - scope `missing` (Default): nur Tage ohne bestehenden Eintrag.
 *  - scope `all`: alle vorhandenen Notiz-Tage neu generieren (überschreibt).
 * `max` begrenzt die Anzahl Tage pro Aufruf (neueste zuerst); der Rest landet
 * in `pendingDays`, sodass die UI erneut anstoßen kann.
 */
export async function generateDiary(opts: {
  scope?: 'missing' | 'all';
  from?: string;
  to?: string;
  max?: number;
  now: string;
}): Promise<DiaryGenerateResult> {
  const scope = opts.scope ?? 'missing';
  // `all` (explizite Nutzer-Aktion „Alles neu") regeneriert standardmäßig bis
  // zur Obergrenze — deckt reale Tagebücher in einem Aufruf komplett ab;
  // `missing` ergänzt in 30er-Schritten. Hard-Cap 120 Tage/Aufruf.
  const max = Math.max(1, Math.min(opts.max ?? (scope === 'all' ? 120 : 30), 120));

  const days = gatherDiaryDays({ from: opts.from, to: opts.to });
  const existing = new Map(parseDiaryEntries().map((e) => [e.date, e]));

  // Zielmenge bestimmen.
  const candidates = scope === 'all' ? days : days.filter((d) => !existing.has(d.date));
  const targets = candidates.slice(0, max); // neueste zuerst (days ist bereits sortiert)
  const pendingDays = candidates.slice(max).map((d) => d.date);

  const errors: { date: string; error: string }[] = [];
  // IMMER von den bestehenden Einträgen ausgehen — so verlieren weder Tage
  // außerhalb eines from/to-Bereichs noch (bei 'all') über `max` hinausgehende
  // Tage ihren (ggf. manuell bearbeiteten) Text. Die Generierungs-Schleife
  // überschreibt nur die `targets`; alles andere bleibt unangetastet.
  const result = new Map<string, DiaryEntry>(existing);

  let generated = 0;
  for (const day of targets) {
    try {
      // Kein harter maxTokens-Cap hier: der konfigurierte Default
      // (config.anthropic.maxTokens / DIARY_MAX_TOKENS) gibt adaptivem Denken
      // genug Spielraum, ohne den kurzen Tagebuchtext abzuschneiden.
      const body = await generateText({ system: SYSTEM_PROMPT, prompt: buildDayPrompt(day) });
      result.set(day.date, { date: day.date, heading: day.label, body });
      generated++;
    } catch (e) {
      errors.push({ date: day.date, error: (e as Error).message });
      // bestehenden Eintrag (falls vorhanden) erhalten
      if (existing.has(day.date)) result.set(day.date, existing.get(day.date)!);
    }
  }

  const raw = assembleDiary([...result.values()], opts.now);
  writeDiaryRaw(raw);

  return {
    generated,
    skippedExisting: scope === 'missing' ? days.length - candidates.length : 0,
    pendingDays,
    errors,
    raw,
  };
}

// ───────────────────────── Status ─────────────────────────

export interface DiaryState {
  available: boolean; // ANTHROPIC_API_KEY hinterlegt?
  model: string;
  raw: string;
  entries: DiaryEntry[];
  noteworthyDays: string[]; // alle Tage mit Notizen/Tagesbild (Generierungs-Grundmenge)
  generatedDays: string[]; // Tage, für die ein Voll-Eintrag existiert
  pendingDays: string[]; // noteworthy, aber noch nicht generiert
  lastGeneratedAt: string | null;
}

export function diaryState(): DiaryState {
  const raw = readDiaryRaw();
  const entries = parseDiaryEntries(raw);
  const generatedDays = entries.map((e) => e.date);
  const generatedSet = new Set(generatedDays);
  const noteworthyDays = gatherDiaryDays().map((d) => d.date);
  const pendingDays = noteworthyDays.filter((d) => !generatedSet.has(d));
  return {
    available: anthropicAvailable(),
    model: anthropicModel(),
    raw,
    entries,
    noteworthyDays,
    generatedDays,
    pendingDays,
    lastGeneratedAt: lastGeneratedAt(raw),
  };
}
