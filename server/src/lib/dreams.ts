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
 * Nightly "dreaming": the daily, factual-medical assessment described by
 * `system_prompt.md`. The "dream" IS this assessment — only branding/
 * presentation is dream-like, not the text itself.
 *
 * Flow per day:
 *   1. Determine target day (default: consumption-day before, see `dreamTargetDate`).
 *   2. Assemble context (plan target/actual, off-plan, wake time, notes,
 *      11 scales, the dreams of the last 7 days) — `gatherDreamContext`.
 *   3. Send system_prompt.md (fresh from disk) + context to MiniMax M3.
 *   4. Save the result as the dream for the target day (idempotent, PK = date).
 */

const longFmt = new Intl.DateTimeFormat('de-DE', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const longFmtEn = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
function dayDate(date: string): Date {
  return new Date(`${date}T12:00:00`);
}
function labelOf(date: string, lang: 'de' | 'en' = 'de'): string {
  return (lang === 'en' ? longFmtEn : longFmt).format(dayDate(date));
}

/**
 * Language-dependent labels for the prompt-scaffolding headings and short
 * hint texts in `gatherDreamContext`. NOT a translation of user/domain data
 * (substance names, intake notes, METRIC labels, Hermes reports) — those
 * stay unchanged in whatever language they were recorded in.
 *
 * Only the structural headings and German inline sentences currently hard-
 * coded in the file get switched. New sections must be added in both
 * languages.
 */
type DreamLang = 'de' | 'en';
const DREAM_LABELS: Record<DreamLang, {
  header: string;
  intro: (label: string, date: string) => string;
  sections: {
    planCurrent: string;
    planEmpty: string;
    planVersionPrefix: (from: string, note: string | null) => string;
    plannedDoses: string;
    noPlannedDoses: string;
    actualIntakes: string;
    noIntakes: string;
    intakeLine: (time: string, substance: string, amount: string, note: string) => string;
    offPlan: string;
    noOffPlan: string;
    wake: string;
    wakeFull: (first: string, last: string, hours: string) => string;
    wakeHint: string;
    wakeLast: (time: string) => string;
    wakeFirst: (time: string) => string;
    noWake: string;
    notes: string;
    assessmentNote: (text: string) => string;
    intakeNote: (time: string, substance: string, text: string) => string;
    noNotes: string;
    scales: string;
    scalesNoAssessment: string;
    scalesPolarityHint: string;
    scalesPolarityPositive: string;
    scalesPolarityNegative: string;
    scaleLine: (label: string, value: string | number, pol: string) => string;
    report: string;
    reportNone: string;
    reportSource: (source: string) => string;
    previousHeader: string;
    previousHint: string;
    previousEmpty: string;
    previousDay: (label: string, date: string) => string;
    recentReportsHeader: string;
    recentReportsHint: string;
    recentReportsEmpty: string;
    recentReportDay: (label: string, date: string, source: string) => string;
    closing: (label: string) => string;
  };
  slots: { morning: string; noon: string; evening: string; night: string };
  noFixedDose: string;
}> = {
  de: {
    header: '# Tagesdaten für die Auswertung',
    intro: (label, date) =>
      `Ziel-Tag (Konsum-Tag, Tagesgrenze 03:30 Europe/Berlin): **${label}** (${date}).`,
    sections: {
      planCurrent: '## Aktueller Medikationsplan',
      planEmpty: 'Kein Medikationsplan hinterlegt.',
      planVersionPrefix: (from, note) => `(gültig ab ${from}${note ? ` — ${note}` : ''})`,
      plannedDoses: '## Geplante Einnahmen (Soll)',
      noPlannedDoses: 'Keine festen geplanten Dosen.',
      actualIntakes: '## Tatsächliche Einnahmen (Ist)',
      noIntakes: 'Keine Einnahmen erfasst.',
      intakeLine: (time, substance, amount, note) =>
        `- ${time} ${substance}${amount}${note}`,
      offPlan: '## Außerplanmäßiger Konsum',
      noOffPlan: 'Kein außerplanmäßiger Konsum erfasst (alle Einnahmen stehen im Plan).',
      wake: '## Wachzeit',
      wakeFull: (first, last, hours) =>
        `Aufwachen bis Einschlafen: ${first}–${last} (≈ ${hours} h wach).`,
      wakeHint:
        ' Hinweis: Das ist die **Wachspanne** (Aufstehen bis Zubettgehen), NICHT Bildschirm-/PC-Zeit.',
      wakeLast: (time) => `Letzter Wach-Moment: ${time} (kein Aufwach-Zeitpunkt erfasst).`,
      wakeFirst: (time) => `Erster Wach-Moment: ${time} (kein Einschlaf-Zeitpunkt erfasst).`,
      noWake: 'Keine Wachzeit-Daten für diesen Tag.',
      notes: '## Tagesnotizen (Freitext)',
      assessmentNote: (text) => `Tagesbild-Notiz: ${text}`,
      intakeNote: (time, substance, text) => `(${time} ${substance}) ${text}`,
      noNotes: 'Keine Notizen.',
      scales: '## Tagesskalen (1–10)',
      scalesNoAssessment: 'Kein Tagesbild erfasst.',
      scalesPolarityHint:
        '(Polarität in Klammern: ↑günstig = höher ist besser, ↑belastend = höher ist schlechter.)',
      scalesPolarityPositive: '↑günstig',
      scalesPolarityNegative: '↑belastend',
      scaleLine: (label, value, pol) => `- ${label}: ${value} (${pol})`,
      report: '## Tagesbericht des Hermes-Agents',
      reportNone:
        'Kein Tagesbericht für diesen Tag (Cron läuft erst um 03:30 — wenn er fehlt, lief der Agent nicht oder die Zustellung schlug fehl).',
      reportSource: (source) => `(Quelle: ${source})`,
      previousHeader: '## Deine letzten 7 Auswertungen',
      previousHint:
        'Lies sie und vermeide Wiederholungen (siehe Anti-Wiederholung im System-Prompt): bestätige/widerlege/verfeinere offene Hypothesen, bring mind. eine genuin neue Beobachtung.',
      previousEmpty: '_Noch keine früheren Auswertungen vorhanden._',
      previousDay: (label, date) => `### ${label} (${date})`,
      recentReportsHeader: '## Tagesberichte des Hermes-Agents (jüngste 7 Tage)',
      recentReportsHint:
        'Was der Hermes-Agent an diesen Tagen getan hat (Coding, Cron-Läufe, Deploys, Fehler). ' +
        'Beziehe dich auf Muster daraus, wenn sie für die Auswertung relevant sind.',
      recentReportsEmpty: '_Noch keine früheren Tagesberichte vorhanden._',
      recentReportDay: (label, date, source) => `### ${label} (${date})${source ? ` — ${source}` : ''}`,
      closing: (label) =>
        `Erstelle nun die Auswertung für **${label}** gemäß deinen Vorgaben (Rolle, Epistemik, Anti-Wiederholung, Ausgabeformat).`,
    },
    slots: { morning: 'morgens', noon: 'mittags', evening: 'abends', night: 'nachts' },
    noFixedDose: '— keine feste Tagesdosis',
  },
  en: {
    header: '# Daily data for evaluation',
    intro: (label, date) =>
      `Target day (consumption day, day boundary 03:30 Europe/Berlin): **${label}** (${date}).`,
    sections: {
      planCurrent: '## Current medication plan',
      planEmpty: 'No medication plan on file.',
      planVersionPrefix: (from, note) => `(effective from ${from}${note ? ` — ${note}` : ''})`,
      plannedDoses: '## Planned intakes (target)',
      noPlannedDoses: 'No fixed planned doses.',
      actualIntakes: '## Actual intakes (actual)',
      noIntakes: 'No intakes recorded.',
      intakeLine: (time, substance, amount, note) =>
        `- ${time} ${substance}${amount}${note}`,
      offPlan: '## Off-plan consumption',
      noOffPlan: 'No off-plan consumption recorded (every intake is on the plan).',
      wake: '## Wake time',
      wakeFull: (first, last, hours) =>
        `Wake to sleep: ${first}–${last} (≈ ${hours} h awake).`,
      wakeHint:
        ' Note: this is the **waking span** (getting up to going to bed), NOT screen/PC time.',
      wakeLast: (time) => `Last waking moment: ${time} (no wake-up time recorded).`,
      wakeFirst: (time) => `First waking moment: ${time} (no sleep time recorded).`,
      noWake: 'No wake-time data for this day.',
      notes: '## Daily notes (free text)',
      assessmentNote: (text) => `Assessment note: ${text}`,
      intakeNote: (time, substance, text) => `(${time} ${substance}) ${text}`,
      noNotes: 'No notes.',
      scales: '## Daily scales (1–10)',
      scalesNoAssessment: 'No daily assessment recorded.',
      scalesPolarityHint:
        '(Polarity in brackets: ↑favourable = higher is better, ↑burden = higher is worse.)',
      scalesPolarityPositive: '↑favourable',
      scalesPolarityNegative: '↑burden',
      scaleLine: (label, value, pol) => `- ${label}: ${value} (${pol})`,
      report: "## Hermes agent's daily report",
      reportNone:
        "No daily report for this day (cron only runs at 03:30 — if it is missing, the agent did not run or delivery failed).",
      reportSource: (source) => `(source: ${source})`,
      previousHeader: '## Your last 7 evaluations',
      previousHint:
        'Read them and avoid repetition (see anti-repetition in the system prompt): confirm/reject/refine open hypotheses, and add at least one genuinely new observation.',
      previousEmpty: '_No earlier evaluations yet._',
      previousDay: (label, date) => `### ${label} (${date})`,
      recentReportsHeader: "## Hermes agent's daily reports (most recent 7 days)",
      recentReportsHint:
        "What the Hermes agent did on these days (coding, cron runs, deploys, errors). " +
        'Refer to patterns from these when relevant to the evaluation.',
      recentReportsEmpty: '_No earlier daily reports yet._',
      recentReportDay: (label, date, source) => `### ${label} (${date})${source ? ` — ${source}` : ''}`,
      closing: (label) =>
        `Now produce the evaluation for **${label}** per your instructions (role, epistemology, anti-repetition, output format).`,
    },
    slots: { morning: 'morning', noon: 'noon', evening: 'evening', night: 'night' },
    noFixedDose: '— no fixed daily dose',
  },
};

/** Returns the slot description of a plan item in the configured language. */
function planSlotsLang(item: PlanItemRow, lang: DreamLang): string {
  const slots = DREAM_LABELS[lang].slots;
  const parts: string[] = [];
  if (item.morning) parts.push(`${slots.morning} ${item.morning}`);
  if (item.noon) parts.push(`${slots.noon} ${item.noon}`);
  if (item.evening) parts.push(`${slots.evening} ${item.evening}`);
  if (item.night) parts.push(`${slots.night} ${item.night}`);
  return parts.join(', ') || DREAM_LABELS[lang].noFixedDose;
}

/**
 * Sets the language directive for the model. Appended BEFORE the context to
 * the system prompt, so `system_prompt.md` (read-only) remains the persona
 * source and the language switch lives centrally in the code.
 *
 * Phrased twice (DE/EN), so the model reliably reads the directive even when
 * the surrounding system prompt is in the other language.
 */
function languageDirective(lang: 'de' | 'en'): string {
  if (lang === 'en') {
    return [
      '',
      '## Output language (mandatory)',
      '',
      'Respond ONLY in English. Every heading, sentence and value you write must be in English —',
      'even though parts of the user-supplied context below may still be in German (substance',
      "names, intake notes, the user's own daily notes, the Hermes agent's report, etc.).",
      'Those are user/domain data you READ — your WRITTEN output stays English.',
      'Do NOT translate quoted user data; leave it as-is.',
    ].join('\n');
  }
  return [
    '',
    '## Ausgabesprache (verbindlich)',
    '',
    'Antworte AUSSCHLIESSLICH auf Deutsch. Jede Überschrift, jeder Satz und jeder',
    'Wert, den du schreibst, muss auf Deutsch sein — auch wenn Teile des unten',
    'gelieferten Kontexts (Substanznamen, Einnahme-Notizen, eigene Tagesnotizen,',
    'Hermes-Bericht …) auf Englisch sein können. Das sind Nutzer-/Domain-Daten,',
    'die du LIEST — dein OUTPUT bleibt Deutsch. Zitierte Nutzerdaten NICHT',
    'übersetzen, sondern unverändert lassen.',
  ].join('\n');
}

// ───────────────────────── Target day ─────────────────────────

/**
 * Consumption day about which tonight's dream is generated = consumption
 * day before (`consumptionDay(now) − 1`). At 04:20 the day just past is the
 * day before; precisely its data (including night medication / daily
 * assessment, which the 03:30 boundary assigns to the previous day) is
 * complete. Analogous to the habit endpoint.
 */
export function dreamTargetDate(now: string = nowLocalISO()): string {
  const today = consumptionDay(now);
  const d = new Date(`${today}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return dateOf(toLocalISO(d));
}

// ───────────────────────── Gather context ─────────────────────────

/** Wall-clock range [date 03:30, date+1 03:29:59] covering exactly consumption day `date`. */
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

/** "HH:MM" from a local datetime string. */
function clock(iso: string): string {
  return iso.slice(11, 16);
}
/** "HH:MM" from unix seconds (local time). */
function clockUnix(unix: number): string {
  const d = new Date(unix * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Description of a plan item's dosing across the day slots (German legacy). */
function planSlots(item: PlanItemRow): string {
  return planSlotsLang(item, 'de');
}

export interface DreamContext {
  date: string;
  label: string;
  /** Assembled user content (markdown) for the model. */
  prompt: string;
  /** Diagnostic: did the day have any content at all (intakes/assessment/wake time)? */
  hasContent: boolean;
}

/**
 * Builds the structured context (English markdown) for evaluating consumption
 * day `date`. Completeness over brevity (M3 has a large context window).
 *
 * Read in (this order): medication plan (target), intakes (actual), off-plan
 * consumption, wake time, daily notes, 11 daily scales, **Hermes agent's
 * daily report (see /api/report/new)**, the 7 most recent dreams, and the
 * 7 most recent agent reports.
 */
export function gatherDreamContext(date: string, lang: 'de' | 'en' = 'de'): DreamContext {
  const L = DREAM_LABELS[lang];
  const localLabel = labelOf(date, lang);
  const lines: string[] = [];
  lines.push(L.header);
  lines.push('');
  lines.push(L.intro(localLabel, date));
  lines.push('');

  // ── Medication plan (effective for target day) ──
  const version = planVersionAt(date);
  const planItems = version ? planItemsFor(version.id) : [];
  lines.push(L.sections.planCurrent);
  if (planItems.length === 0) {
    lines.push(L.sections.planEmpty);
  } else {
    if (version) lines.push(L.sections.planVersionPrefix(version.effective_from, version.note));
    for (const it of planItems) {
      const strength = it.strength ? ` ${it.strength}` : '';
      const reason = it.reason ? ` · Grund: ${it.reason}` : '';
      const notes = it.notes ? ` · ${it.notes}` : '';
      // Slot description is also rendered in the target language.
      const slotsText = planSlotsLang(it, lang);
      const reasonEn = it.reason ? ` · Reason: ${it.reason}` : '';
      const reasonLocalized = lang === 'en' ? reasonEn : reason;
      lines.push(`- ${it.substance_name}${strength}: ${slotsText}${reasonLocalized}${notes}`);
    }
  }
  lines.push('');

  // ── Day's intakes ──
  const intakes = intakesForDay(date);
  const planKeys = new Set(planItems.map((p) => nameKey(p.substance_name)));

  lines.push(L.sections.plannedDoses);
  const plannedDosed = planItems.filter((p) => p.morning || p.noon || p.evening || p.night);
  if (plannedDosed.length === 0) {
    lines.push(L.sections.noPlannedDoses);
  } else {
    for (const it of plannedDosed) lines.push(`- ${it.substance_name}: ${planSlotsLang(it, lang)}`);
  }
  lines.push('');

  lines.push(L.sections.actualIntakes);
  if (intakes.length === 0) {
    lines.push(L.sections.noIntakes);
  } else {
    for (const it of intakes) {
      const amount = it.amount ? ` ${it.amount}` : '';
      const note = it.notes && it.notes.trim() ? ` — ${it.notes.trim()}` : '';
      lines.push(`- ${clock(it.taken_at)} ${it.substance_name}${amount}${note}`);
    }
  }
  lines.push('');

  // ── Off-plan consumption (substances not in the plan) ──
  const offPlan = intakes.filter((it) => !planKeys.has(nameKey(it.substance_name)));
  lines.push(L.sections.offPlan);
  if (offPlan.length === 0) {
    lines.push(L.sections.noOffPlan);
  } else {
    for (const it of offPlan) {
      const amount = it.amount ? ` ${it.amount}` : '';
      const note = it.notes && it.notes.trim() ? ` — ${it.notes.trim()}` : '';
      lines.push(`- ${clock(it.taken_at)} ${it.substance_name}${amount}${note}`);
    }
  }
  lines.push('');

  // ── Wake time ──
  const habit = db.prepare(`SELECT * FROM daily_habits WHERE date = ?`).get(date) as HabitRow | undefined;
  lines.push(L.sections.wake);
  if (habit && (habit.wake_first_unix != null || habit.wake_last_unix != null)) {
    const first = habit.wake_first_unix;
    const last = habit.wake_last_unix;
    if (first != null && last != null) {
      const hours = Math.max(0, (last - first) / 3600);
      lines.push(L.sections.wakeFull(clockUnix(first), clockUnix(last), hours.toFixed(1)) + L.sections.wakeHint);
    } else if (last != null) {
      lines.push(L.sections.wakeLast(clockUnix(last)));
    } else if (first != null) {
      lines.push(L.sections.wakeFirst(clockUnix(first)));
    }
  } else {
    lines.push(L.sections.noWake);
  }
  lines.push('');

  // ── Daily notes (free text) ──
  const assessment = db
    .prepare(`SELECT * FROM daily_assessments WHERE date = ?`)
    .get(date) as AssessmentRow | undefined;
  const intakeNotes = intakes.filter((it) => it.notes && it.notes.trim());
  lines.push(L.sections.notes);
  const noteLines: string[] = [];
  if (assessment?.note && assessment.note.trim()) noteLines.push(L.sections.assessmentNote(assessment.note.trim()));
  for (const it of intakeNotes) noteLines.push(L.sections.intakeNote(clock(it.taken_at), it.substance_name, it.notes!.trim()));
  if (noteLines.length === 0) lines.push(L.sections.noNotes);
  else for (const n of noteLines) lines.push(`- ${n}`);
  lines.push('');

  // ── 11 daily scales ──
  // Scale labels (m.label) stay German domain identifiers — the app owner
  // named them so and the statistics tab uses them identically; rerouting
  // would decouple the dream context from the well-being tab. Instead, the
  // polarity label is emitted in the target language.
  lines.push(L.sections.scales);
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
    lines.push(L.sections.scalesNoAssessment);
  } else {
    lines.push(L.sections.scalesPolarityHint);
    for (const m of METRICS) {
      const v = scores[m.key];
      const pol = m.polarity === 'positive' ? L.sections.scalesPolarityPositive : L.sections.scalesPolarityNegative;
      lines.push(L.sections.scaleLine(m.label, typeof v === 'number' ? v : '—', pol));
    }
  }
  lines.push('');

  // ── Hermes agent's daily report (POST /api/report/new, 03:30 cron) ──
  // Delivered by the Hermes agent shortly after midnight and describes what
  // the agent did on this consumption day (coding sessions, cron runs,
  // deploys, errors …). Supplies additional context: which software/server
  // activity coincided with the day's scales/notes.
  // The report itself is domain/user text and stays unchanged in whatever
  // language it was delivered in; only the section heading is switched.
  const todayReport = reportFor(date);
  lines.push(L.sections.report);
  if (!todayReport) {
    lines.push(L.sections.reportNone);
  } else {
    if (todayReport.source) lines.push(L.sections.reportSource(todayReport.source));
    lines.push(todayReport.report.trim());
  }
  lines.push('');

  // ── The 7 most recent evaluations (not necessarily 7 calendar days — empty
  //    days generate no dream, so they can reach further back). ──
  const previous = dreamsBefore(date, 7);
  lines.push(L.sections.previousHeader);
  lines.push(L.sections.previousHint);
  lines.push('');
  if (previous.length === 0) {
    lines.push(L.sections.previousEmpty);
  } else {
    for (const p of previous) {
      lines.push(L.sections.previousDay(labelOf(p.date, lang), p.date));
      lines.push(p.content.trim());
      lines.push('');
    }
  }
  lines.push('');

  // ── The 7 most recent Hermes agent daily reports (analogous to dreams):
  //    enable the model to spot patterns between agent activity and well-being
  //    across the week (coding marathons, deploy stress, server outages …). ──
  const recentReports = reportsBefore(date, 7);
  lines.push(L.sections.recentReportsHeader);
  lines.push(L.sections.recentReportsHint);
  lines.push('');
  if (recentReports.length === 0) {
    lines.push(L.sections.recentReportsEmpty);
  } else {
    for (const r of recentReports) {
      lines.push(L.sections.recentReportDay(labelOf(r.date, lang), r.date, r.source ?? ''));
      lines.push(r.report.trim());
      lines.push('');
    }
  }
  lines.push('');

  lines.push(L.sections.closing(localLabel));

  const hasContent = intakes.length > 0 || hasScores || habit != null || todayReport != null;
  return { date, label: localLabel, prompt: lines.join('\n'), hasContent };
}

// ───────────────────────── Read system_prompt.md ─────────────────────────

/** Reads system_prompt.md fresh from disk (no cache). Throws if not present. */
export function readSystemPrompt(): string {
  try {
    const txt = fs.readFileSync(config.dream.systemPromptPath, 'utf8').trim();
    if (!txt) throw new Error('empty');
    return txt;
  } catch {
    throw new Error(
      `system_prompt.md not found/readable at ${config.dream.systemPromptPath} ` +
        `(set DREAM_SYSTEM_PROMPT_PATH to override the path).`,
    );
  }
}

// ───────────────────────── Generation ─────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface GenerateDreamResult {
  date: string;
  status: 'created' | 'skipped' | 'empty';
  dream: DreamRow | null;
  attempts: number;
}

/**
 * Generates (and saves) the dream for a consumption day.
 *  - `date`: target day (default `dreamTargetDate()`).
 *  - `force`: overwrite an existing dream (otherwise idempotent: skip).
 *  - `retries`: number of additional attempts on network/API errors (default 2 → 3 total).
 *  - `signal`: optional AbortSignal.
 *
 * On an empty day (no intakes/assessment/wake time) generation is SKIPPED
 * (`status:'empty'`) — there is nothing to evaluate and it saves API cost.
 */
export async function generateDream(opts?: {
  date?: string;
  force?: boolean;
  retries?: number;
  signal?: AbortSignal;
  now?: string;
  /** Output language (default: config.aiLanguage). */
  language?: 'de' | 'en';
}): Promise<GenerateDreamResult> {
  const now = opts?.now ?? nowLocalISO();
  const date = opts?.date ?? dreamTargetDate(now);
  const force = opts?.force ?? false;
  const retries = opts?.retries ?? 2;
  const language = opts?.language ?? config.aiLanguage;

  const existing = dreamFor(date);
  if (existing && !force) {
    return { date, status: 'skipped', dream: existing, attempts: 0 };
  }

  const ctx = gatherDreamContext(date, language);
  if (!ctx.hasContent) {
    return { date, status: 'empty', dream: existing, attempts: 0 };
  }

  // system_prompt.md stays the read-only persona source; the language
  // directive is appended so the switch lives centrally in the code.
  const system = readSystemPrompt() + '\n' + languageDirective(language);

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
      // Configuration errors (no key) and token truncation (same parameters →
      // same result) are not retryable.
      if (lastError.name === 'MinimaxNotConfiguredError' || lastError.name === 'MinimaxTruncatedError') break;
      if (attempt < retries) {
        // Exponential backoff: 2s, 6s, 18s … (data-minimal logging).
        const backoff = 2000 * Math.pow(3, attempt);
        console.warn(
          `[dream] attempt ${attempts} for ${date} failed (${lastError.message}); ` +
            `retrying in ${Math.round(backoff / 1000)}s.`,
        );
        await sleep(backoff);
      }
    }
  }
  throw lastError ?? new Error('Dream generation failed.');
}

/** `date` ± `delta` days as YYYY-MM-DD (local, safe across month boundaries). */
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
 * Backfills missing dreams for the most recent `days` consumption days.
 * Closes two gaps:
 *  - **Restarts across the 04:20 window** (deploy/reboot/suspend): the
 *    once-per-day timer only schedules the NEXT run; the day missed today
 *    would never be backfilled.
 *  - **Empty day that later gets content** (backfilled intakes / late
 *    assessment): at 04:20 `hasContent=false` (status:'empty', nothing saved),
 *    now there is something to evaluate.
 *
 * Idempotent & cheap: days with an existing dream are skipped, empty days
 * abort BEFORE the MiniMax call. Only days with content but no dream incur
 * API calls. Called on server start (fire-and-forget, serialized under
 * `withDreamLock`) — see `startDreamScheduler`.
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
      // Data-minimal: only day + message, no payloads.
      console.error(`[dream] catch-up for ${day} failed: ${(e as Error).message}`);
    }
  }
  return result;
}

/** True if the nightly dreaming is operational (key present). */
export function dreamAvailable(): boolean {
  return minimaxAvailable();
}
