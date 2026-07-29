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
 * Sprachabhängige Labels für die Prompt-Scaffolding-Überschriften und kurzen
 * Hinweistexte in `gatherDreamContext`. KEINE Übersetzung von Nutzer-/Domain-
 * Daten (Substanznamen, Einnahme-Notizen, METRIC-Labels, Hermes-Berichte) —
 * die bleiben unverändert in der Sprache, in der sie erfasst wurden.
 *
 * Nur die strukturellen Überschriften und deutschen Inline-Sätze, die aktuell
 * fest im Code stehen, werden umgeschaltet. Neue Sektionen müssen in beiden
 * Sprachen eingetragen werden.
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

/** Liefert die Slot-Beschreibung eines Plan-Items in der konfigurierten Sprache. */
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
 * Setzt die Sprach-Direktive für das Modell. Wird VOR dem Kontext an den
 * System-Prompt angehängt, damit `system_prompt.md` (read-only) die Persona
 * bleibt und der Sprachwechsel zentral im Code lebt.
 *
 * Doppelt formuliert (DE/EN), damit das Modell die Direktive auch dann
 * zuverlässig liest, wenn der umgebende System-Prompt in der jeweils anderen
 * Sprache steht.
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

/** Beschreibung der Plan-Dosierung eines Items über die Tages-Slots (Deutsch-Legacy). */
function planSlots(item: PlanItemRow): string {
  return planSlotsLang(item, 'de');
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
export function gatherDreamContext(date: string, lang: 'de' | 'en' = 'de'): DreamContext {
  const L = DREAM_LABELS[lang];
  const localLabel = labelOf(date, lang);
  const lines: string[] = [];
  lines.push(L.header);
  lines.push('');
  lines.push(L.intro(localLabel, date));
  lines.push('');

  // ── Medikationsplan (zum Ziel-Tag wirksam) ──
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
      // Slot-Beschreibung wird ebenfalls in der Zielsprache gerendert.
      const slotsText = planSlotsLang(it, lang);
      const reasonEn = it.reason ? ` · Reason: ${it.reason}` : '';
      const reasonLocalized = lang === 'en' ? reasonEn : reason;
      lines.push(`- ${it.substance_name}${strength}: ${slotsText}${reasonLocalized}${notes}`);
    }
  }
  lines.push('');

  // ── Einnahmen des Tages ──
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

  // ── Außerplanmäßiger Konsum (Substanzen, die nicht im Plan stehen) ──
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

  // ── Wachzeit ──
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

  // ── Tagesnotizen (Freitext) ──
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

  // ── 11 Tagesskalen ──
  // Skalen-Labels (m.label) bleiben deutsche Domain-Bezeichner — die App-Eigentümerin
  // hat sie so benannt und der Statisk-Tab nutzt sie identisch; ein Umlenken würde
  // den Traum-Kontext vom Wohlfühl-Tab entkoppeln. Stattdessen wird die Polaritäts-
  // Beschriftung in der Zielsprache ausgegeben.
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

  // ── Tagesbericht des Hermes-Agents (POST /api/report/new, 03:30-Cron) ──
  // Wird vom Hermes-Agent kurz nach Mitternacht eingeliefert und beschreibt,
  // was der Agent an diesem Konsum-Tag getan hat (Coding-Sessions, Cron-Läufe,
  // Deploys, Fehler …). Liefert zusätzlichen Kontext: welche Software-/Server-
  // Aktivität mit den Skalen/Notizen des Tages zusammenfiel.
  // Der Bericht selbst ist Domain-/Nutzer-Text und bleibt unverändert in der
  // Sprache, in der er eingeliefert wurde; nur die Sektions-Überschrift wird
  // umgeschaltet.
  const todayReport = reportFor(date);
  lines.push(L.sections.report);
  if (!todayReport) {
    lines.push(L.sections.reportNone);
  } else {
    if (todayReport.source) lines.push(L.sections.reportSource(todayReport.source));
    lines.push(todayReport.report.trim());
  }
  lines.push('');

  // ── Die 7 jüngsten Auswertungen (nicht zwingend 7 Kalendertage — leere
  //    Tage erzeugen keinen Traum, daher können sie weiter zurückreichen). ──
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

  // ── Die 7 jüngsten Hermes-Agent-Tagesberichte (analog zu den Träumen):
  //    ermöglichen dem Modell, Muster zwischen Agent-Aktivität und Befinden
  //    über die Woche hinweg zu sehen (Coding-Marathons, Deploy-Stress,
  //    Server-Ausfälle …). ──
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
  /** Ausgabesprache (Default: config.aiLanguage). */
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

  // system_prompt.md bleibt die read-only Persona-Quelle; die Sprach-Direktive
  // wird angehängt, damit ein Wechsel zentral im Code lebt.
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
