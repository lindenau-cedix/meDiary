import { Router } from 'express';
import { z } from 'zod';
import { db, type HabitRow } from '../db.js';
import {
  consumptionDayFromUnix,
  dateOf,
  nowLocalISO,
  nowUnix,
  toLocalISO,
  unixToLocalISO,
} from '../lib/time.js';
import { serializeHabit } from '../lib/serialize.js';

export const habitRouter = Router();

/**
 * Tagesweise "Gewohnheitsdaten" — aktuell nur PC-Nutzungszeiten, die der
 * lokale Client (Cron um 03:30 Europe/Berlin) per POST /api/habit/uptime
 * meldet. Gespeichert wird pro **Konsum-Tag** (Tagesgrenze 03:30, identisch
 * zu Einnahmen & Tagesbild).
 *
 * Schema: siehe `daily_habits` in `server/src/db.ts`.
 *   - date (PRIMARY KEY, YYYY-MM-DD)
 *   - pc_first_interaction_unix (REAL, nullable) — erste User-Interaktion
 *     innerhalb des 24h-Fensters vor dem Cron-Lauf
 *   - pc_last_interaction_unix (REAL, nullable) — letzte User-Interaktion
 *     vor dem Cron-Lauf (= kurz vor 03:30 am Empfangstag)
 *
 * Tageszuordnung:
 *   Wir leiten das Speicherdatum aus dem Konsum-Tag des `last`-Timestamps ab —
 *   das ist der semantisch korrekte "Tag, der gerade zu Ende ging". Bei einem
 *   echten 24h-Fenster um 03:30 kann `first` rechnerisch in einem anderen
 *   Konsum-Tag liegen (das Fenster überspannt die Tagesgrenze); das ist KEIN
 *   Fehler — wir setzen es als `crossedBoundary: true` in die Response, damit
 *   der Client eine Diagnose hat, speichern aber unter `last`'s Tag.
 */

const uptimeSchema = z.object({
  last_user_interaction_unix: z.number().finite().nonnegative(),
  first_user_interaction_24h_unix: z.number().finite().nonnegative(),
});

/**
 * Meldet die PC-Nutzungszeiten für den gerade endenden Konsum-Tag.
 * Body: `{ last_user_interaction_unix, first_user_interaction_24h_unix }`
 * (Unix-Sekunden, float erlaubt). Antwort: `{ date, ... }` des gespeicherten
 * Habit-Datensatzes.
 */
habitRouter.post('/uptime', (req, res) => {
  const parsed = uptimeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { last_user_interaction_unix: last, first_user_interaction_24h_unix: first } = parsed.data;

  if (first > last) {
    return res
      .status(400)
      .json({ error: 'first_user_interaction_24h_unix muss <= last_user_interaction_unix sein.' });
  }

  const now = nowUnix();
  // Plausibilität:
  //   - `last` (kurz vor dem Cron) muss nahe an `now` sein. Großzügig ±10 min
  //     (Clock-Skew + Scheduler-Verzögerung), sonst ist es offensichtlich nicht
  //     der gerade eingetretene Tagesabschluss.
  //   - `first` (24h-Backlog-Punkt) darf bis zu ~25 h vor `now` liegen, damit
  //     ein echtes 24h-Fenster, das die 03:30-Tagesgrenze umspannt, nicht still
  //     abgelehnt wird.
  const SLACK_LAST = 10 * 60;
  const MAX_BACK_FIRST = 25 * 3600;
  if (last > now + SLACK_LAST) {
    return res.status(400).json({ error: 'last_user_interaction_unix liegt in der Zukunft.' });
  }
  if (first < now - MAX_BACK_FIRST - SLACK_LAST) {
    return res
      .status(400)
      .json({ error: 'first_user_interaction_24h_unix liegt mehr als 25h vor jetzt.' });
  }

  const lastDay = consumptionDayFromUnix(last);
  const firstDay = consumptionDayFromUnix(first);
  if (!lastDay || !firstDay) {
    return res.status(400).json({ error: 'Konsum-Tag konnte nicht ermittelt werden.' });
  }

  // Tageszuordnung: `last` ist der semantisch maßgebliche Zeitpunkt ("letzte
  // Aktivität vor dem Tages-Cron" = "Aktivität am Ende des Konsum-Tages, der
  // gerade endet"). Wir speichern unter `last`'s Konsum-Tag. `first` kann
  // rechnerisch in einem anderen Konsum-Tag liegen, wenn das 24h-Fenster die
  // 03:30-Tagesgrenze überspannt — das ist erwartet (siehe README/AGENTS.md
  // "Tagesgrenze 03:30") und KEIN Fehler. Wir melden es nur als `crossedBoundary`,
  // damit der Client eine Diagnose hat.
  const date = lastDay;
  const crossedBoundary = lastDay !== firstDay;

  const nowIso = nowLocalISO();
  const isoLast = unixToLocalISO(last);
  const isoFirst = unixToLocalISO(first);
  db.prepare(
    `INSERT INTO daily_habits (date, pc_first_interaction_unix, pc_last_interaction_unix, created_at, updated_at)
     VALUES (@date, @first, @last, @now, @now)
     ON CONFLICT(date) DO UPDATE SET
       pc_first_interaction_unix = @first,
       pc_last_interaction_unix  = @last,
       updated_at                = @now`,
  ).run({ date, first, last, now: nowIso });

  const row = db.prepare(`SELECT * FROM daily_habits WHERE date = ?`).get(date) as HabitRow;
  res.status(200).json({
    ...serializeHabit(row),
    // zusätzliche Debug-Infos (lokal aufgelöste ISO-Zeiten + Konsum-Tage der
    // beiden Werte), hilfreich beim Smoke-Test des Crons; bewusst kleines Payload.
    firstLocal: isoFirst,
    lastLocal: isoLast,
    firstDay,
    lastDay,
    crossedBoundary,
  });
});

/**
 * Liste der Habit-Tage (Range). `?from=&to=` (YYYY-MM-DD) grenzen ein.
 * Ohne Filter: alle vorhandenen Tage (aufsteigend nach Datum).
 */
habitRouter.get('/', (req, res) => {
  const where: string[] = [];
  const params: Record<string, unknown> = {};
  if (typeof req.query.from === 'string') {
    where.push(`date >= @from`);
    params.from = req.query.from.slice(0, 10);
  }
  if (typeof req.query.to === 'string') {
    where.push(`date <= @to`);
    params.to = req.query.to.slice(0, 10);
  }
  const rows = db
    .prepare(
      `SELECT * FROM daily_habits ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY date ASC`,
    )
    .all(params) as HabitRow[];
  res.json(rows.map(serializeHabit));
});

/** Einzelner Tag. Liefert 200 mit exists=false, wenn nichts gespeichert ist. */
habitRouter.get('/:date', (req, res) => {
  const date = req.params.date.slice(0, 10);
  const row = db.prepare(`SELECT * FROM daily_habits WHERE date = ?`).get(date) as HabitRow | undefined;
  if (!row) {
    return res.json({
      date,
      pcFirstInteractionUnix: null,
      pcLastInteractionUnix: null,
      exists: false,
    });
  }
  res.json({ ...serializeHabit(row), exists: true });
});

/** Tag löschen (z. B. wenn der User die Aufzeichnung verwirft). */
habitRouter.delete('/:date', (req, res) => {
  const date = req.params.date.slice(0, 10);
  const info = db.prepare(`DELETE FROM daily_habits WHERE date = ?`).run(date);
  if (info.changes === 0) return res.status(404).json({ error: 'Kein Habit-Datensatz für diesen Tag' });
  res.status(204).end();
});

// (re-export für Tests / Konsumenten, die das aktuelle "Ziel"-Datum sehen wollen)
export { dateOf, toLocalISO };
