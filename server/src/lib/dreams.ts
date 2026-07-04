import fs from 'node:fs';
import { config } from '../config.js';
import {
  db,
  planVersionAt,
  planItemsFor,
  dreamFor,
  dreamsBefore,
  reportFor,
  reportsBefore,
  upsertDream,
  type IntakeRow,
  type AssessmentRow,
  type HabitRow,
  type PlanItemRow,
  type DreamRow,
} from '../db.js';
import { consumptionDay, dateOf, nowLocalISO, toLocalISO } from './time.js';
import { nameKey } from './names.js';
import { METRICS } from './metrics.js';
import { dreamText, minimaxAvailable, minimaxModel } from './minimax.js';

/**
 * Nächtliches „Träumen": die tägliche, sachlich-medizinische Auswertung, die
 * `system_prompt.md` beschreibt. Der „Traum" IST diese Auswertung — träumerisch
 * sind nur Branding/Präsentation, nicht der Text.
 *
 * Ablauf je Tag:
 *   1. Ziel-Tag bestimmen (Default: Konsum-Vortag, siehe `dreamTargetDate`).
 *   2. Kontext zusammenbauen (Plan Soll/Ist, außerplanmäßig, Wachzeit, Notizen,
 *      11 Skalen, die Träume der letzten 7 Tage) — `gatherDreamContext`.
 *   3. system_prompt.md (frisch von Platte) + Kontext an MiniMax M3 schicken.
 *   4. Ergebnis als Traum unter dem Ziel-Tag speichern (idempotent, PK = date).
 */

const longFmt = new Intl.DateTimeFormat('de-DE', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
function dayDate(date: string): Date {
  return new Date(`${date}T12:00:00`);
}
function labelOf(date: string): string {
  return longFmt.format(dayDate(date));
}

// ───────────────────────── Ziel-Tag ─────────────────────────

/**
 * Konsum-Tag, über den heute Nacht geträumt wird = Konsum-Vortag
 * (`consumptionDay(jetzt) − 1`). Um 04:20 ist der gerade vergangene Tag der
 * Vortag; genau dessen Daten (inkl. Nachtmedikation/Tagesbild, die per
 * 03:30-Grenze zum Vortag zählen) sind vollständig. Analog zum Habit-Endpoint.
 */
export function dreamTargetDate(now: string = nowLocalISO()): string {
  const today = consumptionDay(now);
  const d = new Date(`${today}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return dateOf(toLocalISO(d));
}

// ───────────────────────── Kontext sammeln ─────────────────────────

/** Wand­uhr-Bereich [date 03:30, date+1 03:29:59], der genau Konsum-Tag `date` abdeckt. */
function consumptionRange(date: string): { start: string; end: string } {
  const next = new Date(`${date}T12:00:00`);
  next.setDate(next.getDate() + 1);
  const nextStr = dateOf(toLocalISO(next));
  return { start: `${date}T03:30:00`, end: `${nextStr}T03:29:59` };
}

function intakesForDay(date: string): IntakeRow[] {
  const { start, end } = consumptionRange(date);
  return db
    .prepare(`SELECT * FROM intakes WHERE taken_at >= ? AND taken_at <= ? ORDER BY taken_at ASC, id ASC`)
    .all(start, end) as IntakeRow[];
}

/** "HH:MM" aus lokalem Datetime-String. */
function clock(iso: string): string {
  return iso.slice(11, 16);
}
/** "HH:MM" aus Unix-Sekunden (lokale Zeit). */
function clockUnix(unix: number): string {
  const d = new Date(unix * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Beschreibung der Plan-Dosierung eines Items über die Tages-Slots. */
function planSlots(item: PlanItemRow): string {
  const parts: string[] = [];
  if (item.morning) parts.push(`morgens ${item.morning}`);
  if (item.noon) parts.push(`mittags ${item.noon}`);
  if (item.evening) parts.push(`abends ${item.evening}`);
  if (item.night) parts.push(`nachts ${item.night}`);
  return parts.join(', ') || '— keine feste Tagesdosis';
}

export interface DreamContext {
  date: string;
  label: string;
  /** Zusammengebauter User-Inhalt (Markdown) für das Modell. */
  prompt: string;
  /** Diagnose: hatte der Tag überhaupt Inhalt (Einnahmen/Tagesbild/Wachzeit)? */
  hasContent: boolean;
}

/**
 * Baut den strukturierten Kontext (deutsches Markdown) für die Auswertung des
 * Konsum-Tages `date`. Vollständigkeit vor Kürzung (M3 hat großes Kontextfenster).
 *
 * Eingelesen werden (in dieser Reihenfolge): Medikationsplan (Soll),
 * Einnahmen (Ist), außerplanmäßiger Konsum, Wachzeit, Tagesnotizen,
 * 11 Tagesskalen, **Tagesbericht des Hermes-Agents (siehe /api/report/new)**,
 * die 7 jüngsten Träume und die 7 jüngsten Agent-Berichte.
 */
export function gatherDreamContext(date: string): DreamContext {
  const lines: string[] = [];
  lines.push(`# Tagesdaten für die Auswertung`);
  lines.push('');
  lines.push(`Ziel-Tag (Konsum-Tag, Tagesgrenze 03:30 Europe/Berlin): **${labelOf(date)}** (${date}).`);
  lines.push('');

  // ── Medikationsplan (zum Ziel-Tag wirksam) ──
  const version = planVersionAt(date);
  const planItems = version ? planItemsFor(version.id) : [];
  lines.push(`## Aktueller Medikationsplan`);
  if (planItems.length === 0) {
    lines.push('Kein Medikationsplan hinterlegt.');
  } else {
    if (version) lines.push(`(gültig ab ${version.effective_from}${version.note ? ` — ${version.note}` : ''})`);
    for (const it of planItems) {
      const strength = it.strength ? ` ${it.strength}` : '';
      const reason = it.reason ? ` · Grund: ${it.reason}` : '';
      const notes = it.notes ? ` · ${it.notes}` : '';
      lines.push(`- ${it.substance_name}${strength}: ${planSlots(it)}${reason}${notes}`);
    }
  }
  lines.push('');

  // ── Einnahmen des Tages ──
  const intakes = intakesForDay(date);
  const planKeys = new Set(planItems.map((p) => nameKey(p.substance_name)));

  lines.push(`## Geplante Einnahmen (Soll)`);
  const plannedDosed = planItems.filter((p) => p.morning || p.noon || p.evening || p.night);
  if (plannedDosed.length === 0) {
    lines.push('Keine festen geplanten Dosen.');
  } else {
    for (const it of plannedDosed) lines.push(`- ${it.substance_name}: ${planSlots(it)}`);
  }
  lines.push('');

  lines.push(`## Tatsächliche Einnahmen (Ist)`);
  if (intakes.length === 0) {
    lines.push('Keine Einnahmen erfasst.');
  } else {
    for (const it of intakes) {
      const amount = it.amount ? ` ${it.amount}` : '';
      const note = it.notes && it.notes.trim() ? ` — ${it.notes.trim()}` : '';
      lines.push(`- ${clock(it.taken_at)} ${it.substance_name}${amount}${note}`);
    }
  }
  lines.push('');

  // ── Außerplanmäßiger Konsum (Substanzen, die nicht im Plan stehen) ──
  const offPlan = intakes.filter((it) => !planKeys.has(nameKey(it.substance_name)));
  lines.push(`## Außerplanmäßiger Konsum`);
  if (offPlan.length === 0) {
    lines.push('Kein außerplanmäßiger Konsum erfasst (alle Einnahmen stehen im Plan).');
  } else {
    for (const it of offPlan) {
      const amount = it.amount ? ` ${it.amount}` : '';
      const note = it.notes && it.notes.trim() ? ` — ${it.notes.trim()}` : '';
      lines.push(`- ${clock(it.taken_at)} ${it.substance_name}${amount}${note}`);
    }
  }
  lines.push('');

  // ── Wachzeit ──
  const habit = db.prepare(`SELECT * FROM daily_habits WHERE date = ?`).get(date) as HabitRow | undefined;
  lines.push(`## Wachzeit`);
  if (habit && (habit.wake_first_unix != null || habit.wake_last_unix != null)) {
    const first = habit.wake_first_unix;
    const last = habit.wake_last_unix;
    if (first != null && last != null) {
      const hours = Math.max(0, (last - first) / 3600);
      lines.push(
        `Aufwachen bis Einschlafen: ${clockUnix(first)}–${clockUnix(last)} (≈ ${hours.toFixed(1)} h wach). ` +
          `Hinweis: Das ist die **Wachspanne** (Aufstehen bis Zubettgehen), NICHT Bildschirm-/PC-Zeit.`,
      );
    } else if (last != null) {
      lines.push(`Letzter Wach-Moment: ${clockUnix(last)} (kein Aufwach-Zeitpunkt erfasst).`);
    } else if (first != null) {
      lines.push(`Erster Wach-Moment: ${clockUnix(first)} (kein Einschlaf-Zeitpunkt erfasst).`);
    }
  } else {
    lines.push('Keine Wachzeit-Daten für diesen Tag.');
  }
  lines.push('');

  // ── Tagesnotizen (Freitext) ──
  const assessment = db
    .prepare(`SELECT * FROM daily_assessments WHERE date = ?`)
    .get(date) as AssessmentRow | undefined;
  const intakeNotes = intakes.filter((it) => it.notes && it.notes.trim());
  lines.push(`## Tagesnotizen (Freitext)`);
  const noteLines: string[] = [];
  if (assessment?.note && assessment.note.trim()) noteLines.push(`Tagesbild-Notiz: ${assessment.note.trim()}`);
  for (const it of intakeNotes) noteLines.push(`(${clock(it.taken_at)} ${it.substance_name}) ${it.notes!.trim()}`);
  if (noteLines.length === 0) lines.push('Keine Notizen.');
  else for (const n of noteLines) lines.push(`- ${n}`);
  lines.push('');

  // ── 11 Tagesskalen ──
  lines.push(`## Tagesskalen (1–10)`);
  let scores: Record<string, number> = {};
  if (assessment) {
    try {
      scores = JSON.parse(assessment.scores);
    } catch {
      scores = {};
    }
  }
  const hasScores = METRICS.some((m) => typeof scores[m.key] === 'number');
  if (!hasScores) {
    lines.push('Kein Tagesbild erfasst.');
  } else {
    lines.push('(Polarität in Klammern: ↑günstig = höher ist besser, ↑belastend = höher ist schlechter.)');
    for (const m of METRICS) {
      const v = scores[m.key];
      const pol = m.polarity === 'positive' ? '↑günstig' : '↑belastend';
      lines.push(`- ${m.label}: ${typeof v === 'number' ? v : '—'} (${pol})`);
    }
  }
  lines.push('');

  // ── Tagesbericht des Hermes-Agents (POST /api/report/new, 03:30-Cron) ──
  // Wird vom Hermes-Agent kurz nach Mitternacht eingeliefert und beschreibt,
  // was der Agent an diesem Konsum-Tag getan hat (Coding-Sessions, Cron-Läufe,
  // Deploys, Fehler …). Liefert zusätzlichen Kontext: welche Software-/Server-
  // Aktivität mit den Skalen/Notizen des Tages zusammenfiel.
  const todayReport = reportFor(date);
  lines.push(`## Tagesbericht des Hermes-Agents`);
  if (!todayReport) {
    lines.push('Kein Tagesbericht für diesen Tag (Cron läuft erst um 03:30 — wenn er fehlt, lief der Agent nicht oder die Zustellung schlug fehl).');
  } else {
    if (todayReport.source) lines.push(`(Quelle: ${todayReport.source})`);
    lines.push(todayReport.report.trim());
  }
  lines.push('');

  // ── Die 7 jüngsten Auswertungen (nicht zwingend 7 Kalendertage — leere
  //    Tage erzeugen keinen Traum, daher können sie weiter zurückreichen). ──
  const previous = dreamsBefore(date, 7);
  lines.push(`## Deine letzten 7 Auswertungen`);
  lines.push(
    'Lies sie und vermeide Wiederholungen (siehe Anti-Wiederholung im System-Prompt): bestätige/widerlege/verfeinere offene Hypothesen, bring mind. eine genuin neue Beobachtung.',
  );
  lines.push('');
  if (previous.length === 0) {
    lines.push('_Noch keine früheren Auswertungen vorhanden._');
  } else {
    for (const p of previous) {
      lines.push(`### ${labelOf(p.date)} (${p.date})`);
      lines.push(p.content.trim());
      lines.push('');
    }
  }
  lines.push('');

  // ── Die 7 jüngsten Hermes-Agent-Tagesberichte (analog zu den Träumen):
  //    ermöglichen dem Modell, Muster zwischen Agent-Aktivität und Befinden
  //    über die Woche hinweg zu sehen (Coding-Marathons, Deploy-Stress,
  //    Server-Ausfälle …). ──
  const recentReports = reportsBefore(date, 7);
  lines.push(`## Tagesberichte des Hermes-Agents (jüngste 7 Tage)`);
  lines.push(
    'Was der Hermes-Agent an diesen Tagen getan hat (Coding, Cron-Läufe, Deploys, Fehler). ' +
      'Beziehe dich auf Muster daraus, wenn sie für die Auswertung relevant sind.',
  );
  lines.push('');
  if (recentReports.length === 0) {
    lines.push('_Noch keine früheren Tagesberichte vorhanden._');
  } else {
    for (const r of recentReports) {
      lines.push(`### ${labelOf(r.date)} (${r.date})${r.source ? ` — ${r.source}` : ''}`);
      lines.push(r.report.trim());
      lines.push('');
    }
  }
  lines.push('');

  lines.push(
    `Erstelle nun die Auswertung für **${labelOf(date)}** gemäß deinen Vorgaben (Rolle, Epistemik, Anti-Wiederholung, Ausgabeformat).`,
  );

  const hasContent = intakes.length > 0 || hasScores || habit != null || todayReport != null;
  return { date, label: labelOf(date), prompt: lines.join('\n'), hasContent };
}

// ───────────────────────── system_prompt.md lesen ─────────────────────────

/** Liest system_prompt.md frisch von Platte (kein Cache). Wirft, wenn nicht vorhanden. */
export function readSystemPrompt(): string {
  try {
    const txt = fs.readFileSync(config.dream.systemPromptPath, 'utf8').trim();
    if (!txt) throw new Error('leer');
    return txt;
  } catch {
    throw new Error(
      `system_prompt.md nicht gefunden/lesbar unter ${config.dream.systemPromptPath} ` +
        `(DREAM_SYSTEM_PROMPT_PATH setzen, um den Pfad zu überschreiben).`,
    );
  }
}

// ───────────────────────── Generierung ─────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface GenerateDreamResult {
  date: string;
  status: 'created' | 'skipped' | 'empty';
  dream: DreamRow | null;
  attempts: number;
}

/**
 * Erzeugt (und speichert) den Traum für einen Konsum-Tag.
 *  - `date`: Ziel-Tag (Default `dreamTargetDate()`).
 *  - `force`: vorhandenen Traum überschreiben (sonst Idempotenz: skip).
 *  - `retries`: Anzahl zusätzlicher Versuche bei Netz-/API-Fehlern (Default 2 → 3 gesamt).
 *  - `signal`: optionaler AbortSignal.
 *
 * Bei leerem Tag (keine Einnahmen/Tagesbild/Wachzeit) wird NICHT generiert
 * (`status:'empty'`) — es gäbe nichts auszuwerten und es spart API-Kosten.
 */
export async function generateDream(opts?: {
  date?: string;
  force?: boolean;
  retries?: number;
  signal?: AbortSignal;
  now?: string;
}): Promise<GenerateDreamResult> {
  const now = opts?.now ?? nowLocalISO();
  const date = opts?.date ?? dreamTargetDate(now);
  const force = opts?.force ?? false;
  const retries = opts?.retries ?? 2;

  const existing = dreamFor(date);
  if (existing && !force) {
    return { date, status: 'skipped', dream: existing, attempts: 0 };
  }

  const ctx = gatherDreamContext(date);
  if (!ctx.hasContent) {
    return { date, status: 'empty', dream: existing, attempts: 0 };
  }

  const system = readSystemPrompt();

  let lastError: Error | null = null;
  let attempts = 0;
  for (let attempt = 0; attempt <= retries; attempt++) {
    attempts = attempt + 1;
    try {
      const content = await dreamText({ system, user: ctx.prompt, signal: opts?.signal });
      const dream = upsertDream(date, content, minimaxModel());
      return { date, status: 'created', dream, attempts };
    } catch (e) {
      lastError = e as Error;
      // Konfigurationsfehler (kein Key) und Token-Abbruch (gleiche Parameter →
      // gleiches Ergebnis) sind nicht retry-bar.
      if (lastError.name === 'MinimaxNotConfiguredError' || lastError.name === 'MinimaxTruncatedError') break;
      if (attempt < retries) {
        // Exponentielles Backoff: 2s, 6s, 18s … (datensparsames Logging).
        const backoff = 2000 * Math.pow(3, attempt);
        console.warn(
          `[dream] Versuch ${attempts} für ${date} fehlgeschlagen (${lastError.message}); ` +
            `erneuter Versuch in ${Math.round(backoff / 1000)}s.`,
        );
        await sleep(backoff);
      }
    }
  }
  throw lastError ?? new Error('Traum-Generierung fehlgeschlagen.');
}

/** `date` ± `delta` Tage als YYYY-MM-DD (lokal, robust über Monatsgrenzen). */
function shiftDay(date: string, delta: number): string {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + delta);
  return dateOf(toLocalISO(d));
}

export interface CatchUpResult {
  generated: string[];
  skipped: number;
  empty: number;
  failed: number;
}

/**
 * Holt fehlende Träume der jüngsten `days` Konsum-Tage nach. Behebt zwei Lücken:
 *  - **Neustart über das 04:20-Fenster hinweg** (Deploy/Reboot/Suspend): der
 *    einmal-pro-Tag-Timer plant nur den NÄCHSTEN Lauf, der heute verpasste Tag
 *    würde nie nachgeholt.
 *  - **Leerer Tag, der später Inhalt bekommt** (rückwirkende Einnahmen /
 *    nachgetragenes Tagesbild): am 04:20 war `hasContent=false` (status:'empty',
 *    nichts gespeichert), jetzt gäbe es etwas auszuwerten.
 *
 * Idempotent & günstig: Tage mit vorhandenem Traum werden übersprungen, leere
 * Tage brechen VOR dem MiniMax-Call ab. Es entstehen nur API-Calls für Tage mit
 * Inhalt aber ohne Traum. Aufruf beim Serverstart (fire-and-forget, unter
 * `withDreamLock` serialisiert) — siehe `startDreamScheduler`.
 */
export async function catchUpDreams(opts?: { days?: number; now?: string }): Promise<CatchUpResult> {
  const now = opts?.now ?? nowLocalISO();
  const days = Math.max(0, Math.floor(opts?.days ?? 7));
  const target = dreamTargetDate(now);
  const result: CatchUpResult = { generated: [], skipped: 0, empty: 0, failed: 0 };

  for (let i = 0; i < days; i++) {
    const day = shiftDay(target, -i);
    if (dreamFor(day)) {
      result.skipped++;
      continue;
    }
    try {
      const res = await generateDream({ date: day, now });
      if (res.status === 'created') result.generated.push(day);
      else if (res.status === 'empty') result.empty++;
      else result.skipped++;
    } catch (e) {
      result.failed++;
      // Datensparsam: nur Tag + Meldung, keine Payloads.
      console.error(`[dream] Catch-up für ${day} fehlgeschlagen: ${(e as Error).message}`);
    }
  }
  return result;
}

/** True, wenn das nächtliche Träumen einsatzbereit ist (Key vorhanden). */
export function dreamAvailable(): boolean {
  return minimaxAvailable();
}
