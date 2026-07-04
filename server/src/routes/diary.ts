import { Router } from 'express';
import { z } from 'zod';
import { nowLocalISO } from '../lib/time.js';
import {
  gatherDiaryDays,
  diaryState,
  generateDiary,
  readDiaryRaw,
  writeDiaryRaw,
  parseDiaryEntries,
  lastGeneratedAt,
} from '../lib/diary.js';
import { anthropicAvailable } from '../lib/anthropic.js';

export const diaryRouter = Router();

/**
 * Kurzversion: reine Liste der Notizen je Konsum-Tag (Einnahme-Notizen +
 * Tagesbild + PC-Habit + Hermes-Agent-Tagesbericht). Liest nur, schreibt nie
 * in die DB. `?from=&to=` (YYYY-MM-DD) grenzt ein.
 */
diaryRouter.get('/notes', (req, res) => {
  const from = typeof req.query.from === 'string' ? req.query.from : undefined;
  const to = typeof req.query.to === 'string' ? req.query.to : undefined;
  const days = gatherDiaryDays({ from, to }).map((d) => ({
    date: d.date,
    weekday: d.weekday,
    label: d.label,
    // nur Notiz-tragende Einnahmen für die Kurzliste
    intakes: d.intakes.filter((i) => i.note),
    assessment: d.assessment,
    habit: d.habit,
    report: d.report,
  }));
  res.json({ days });
});

/** Zustand der Voll-Tagebuch-Datei (Einträge, offene Tage, Key vorhanden?). */
diaryRouter.get('/', (_req, res) => {
  res.json(diaryState());
});

const generateSchema = z.object({
  scope: z.enum(['missing', 'all']).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  max: z.number().int().positive().optional(),
});

/**
 * Generiert/aktualisiert die Voll-Tagebuch-Einträge via KI und schreibt die
 * .md-Datei. 503, wenn kein ANTHROPIC_API_KEY hinterlegt ist (Kurzversion und
 * das Anzeigen vorhandener Einträge funktionieren weiterhin).
 */
diaryRouter.post('/generate', async (req, res) => {
  if (!anthropicAvailable()) {
    return res.status(503).json({
      error:
        'KI-Tagebuch ist nicht konfiguriert. Setze ANTHROPIC_API_KEY (und optional DIARY_MODEL) in der .env.',
    });
  }
  const parsed = generateSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const result = await generateDiary({ ...parsed.data, now: nowLocalISO() });
    const state = diaryState();
    // `result.pendingDays` ist die maßgebliche Restmenge (Tage, die wegen `max`
    // diesmal nicht (re)generiert wurden) — ehrlicher als die rein
    // datei-abgeleitete pendingDays aus diaryState (die über-`max`-Tage tragen
    // bei 'all' noch ihren alten Eintrag und wären sonst fälschlich „fertig").
    res.json({
      ...state,
      pendingDays: result.pendingDays,
      generated: result.generated,
      skippedExisting: result.skippedExisting,
      errors: result.errors,
    });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/** Manuelles Bearbeiten/Speichern der Tagebuch-Datei (wie der DEFAULTS-Editor). */
diaryRouter.put('/', (req, res) => {
  const parsed = z.object({ content: z.string() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  writeDiaryRaw(parsed.data.content);
  const raw = readDiaryRaw();
  res.json({ ...diaryState(), raw, entries: parseDiaryEntries(raw), lastGeneratedAt: lastGeneratedAt(raw) });
});
