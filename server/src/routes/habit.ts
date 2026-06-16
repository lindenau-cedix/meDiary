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
 * Tagesweise "Gewohnheitsdaten" — aktuell nur die tägliche **Wachzeit**:
 * das ist der Zeitraum vom Aufwachen bis zum Einschlafen, gemischt aus
 * Einnahme-Ereignissen und einem Webhook, den der lokale Client (Cron um
 * 03:30 Europe/Berlin) per `POST /api/habit/uptime` meldet.
 *
 * Schema: siehe `daily_habits` in `server/src/db.ts`.
 *   - date (PRIMARY KEY, YYYY-MM-DD) — **immer** der Vortag aus Sicht
 *     des Webhook-Aufrufs (Konsum-Tag `today - 1`).
 *   - wake_first_unix (REAL, nullable) — Unix-Sek des ersten Wach-Moments
 *     des Tages. Algorithmus: jüngste Einnahme des Vortages, deren
 *     Konsum-Tag = Vortag UND die zwischen 03:30 und `first_user_interaction_24h_unix`
 *     liegt — wenn vorhanden, deren Unix-Zeit; sonst `first_user_interaction_24h_unix`.
 *   - wake_last_unix  (REAL, nullable) — Unix-Sek des letzten Wach-Moments:
 *     max(jüngste Einnahme des Vortages, `last_user_interaction_unix`).
 *
 * Die Webhook-Daten bezeichnen KEINE Bildschirmzeit mehr, sondern werden
 * als Indikator für "noch wach" gewertet: `first_user_interaction_24h_unix`
 * ist der früheste Hinweis darauf, dass der Mensch an jenem Tag wach war
 * (am PC); `last_user_interaction_unix` der späteste. In Kombination mit
 * den Einnahme-Zeitpunkten ergeben sie die ungefähre Wachspanne.
 */

const uptimeSchema = z.object({
  last_user_interaction_unix: z.number().finite().nonnegative(),
  first_user_interaction_24h_unix: z.number().finite().nonnegative(),
});

/**
 * Berechnet den Konsum-Vortag (Bezug: Konsum-Tag `now` minus 1 Kalendertag).
 * Der Webhook wird typischerweise um 03:30 ausgelöst — zu diesem Zeitpunkt
 * IST der Konsum-Tag des Vortags gerade zu Ende gegangen, und der "neue"
 * Konsum-Tag hat noch nicht begonnen. Wir wählen den Vortag hartcodiert,
 * unabhängig vom tatsächlichen `last_user_interaction_unix` (das vermeidet
 * Fehlzuordnungen, wenn der Client zu anderer Zeit läuft).
 */
function yesterdayConsumptionDay(): string {
  // Konsum-Tag "heute" bestimmen (lokale Wand­uhr, 03:30-Grenze).
  const todayIso = nowLocalISO(); // "YYYY-MM-DDTHH:mm:ss"
  const todayConsumption = dateOf(
    // consumptionDay() aus time.ts inlined (es ist die einzige Stelle, die
    // Konsum-Tag-Berechnung benötigt — bewusst keine zirkuläre Importorgie).
    (() => {
      const day = todayIso.slice(0, 10);
      const minutes =
        Number(todayIso.slice(11, 13)) * 60 + Number(todayIso.slice(14, 16));
      if (minutes < 3 * 60 + 30) {
        const d = new Date(`${day}T12:00:00`);
        d.setDate(d.getDate() - 1);
        return toLocalISO(d).slice(0, 10) + todayIso.slice(10);
      }
      return todayIso;
    })(),
  );
  // minus 1 Kalendertag (Datumstechnisch, unabhängig von Tagesgrenze).
  const d = new Date(`${todayConsumption}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return toLocalISO(d).slice(0, 10);
}

/**
 * Meldet die täglichen Wachzeit-Daten für den **Vortag** (aus Sicht des
 * Webhook-Aufrufs). Body: `{ last_user_interaction_unix,
 * first_user_interaction_24h_unix }` (Unix-Sekunden, float erlaubt).
 *
 * Algorithmus (siehe AGENTS.md „Habit/Wachzeit"):
 *   1. Ziel-Datum = Konsum-Vortag (heute - 1).
 *   2. Einnahmen-`first` = spätester Einnahme-Zeitpunkt am Vortag, dessen
 *      Konsum-Tag = Vortag UND der zwischen 03:30 (Wand­uhr am Vortag) und
 *      `first_user_interaction_24h_unix` liegt. Existiert keiner → null.
 *   3. Einnahmen-`last` = spätester Einnahme-Zeitpunkt am Vortag
 *      (Konsum-Tag = Vortag), oder null.
 *   4. `wake_first_unix` = (2) gefunden → dessen Unix; sonst
 *      `first_user_interaction_24h_unix`.
 *   5. `wake_last_unix` = max((3) Unix, `last_user_interaction_unix`).
 *
 * Antwort: gespeicherter Habit-Datensatz + Debug-Felder.
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
  // Plausi-Checks (großzügig, damit ein Cron um 03:30 und manuelle
  // Nachreichungen gleichermaßen durchgehen):
  //  - `last` (kurz vor dem Cron) muss nahe an `now` sein: ±15 min
  //    (Clock-Skew + Scheduler-Verzögerung; vorher 10 min — minimal
  //    erweitert, damit auch ein paar Sekunden verzögerte Aufrufe nicht
  //    abgelehnt werden).
  //  - `first` (24h-Backlog-Punkt) darf bis zu ~25 h vor `now` liegen,
  //    damit ein echtes 24h-Fenster, das die 03:30-Tagesgrenze umspannt,
  //    nicht still abgelehnt wird.
  const SLACK_LAST = 15 * 60;
  const MAX_BACK_FIRST = 25 * 3600;
  if (last > now + SLACK_LAST) {
    return res.status(400).json({ error: 'last_user_interaction_unix liegt in der Zukunft.' });
  }
  if (first < now - MAX_BACK_FIRST - SLACK_LAST) {
    return res
      .status(400)
      .json({ error: 'first_user_interaction_24h_unix liegt mehr als 25h vor jetzt.' });
  }

  // Ziel-Datum: Konsum-Vortag (Webhook = "Bericht für den gerade beendeten Tag").
  const targetDate = yesterdayConsumptionDay();

  // Einnahmen am Ziel-Tag laden. Wir suchen im Wand­uhr-Bereich, der genau
  // dem Konsum-Tag `targetDate` entspricht: [targetDate 03:30, target+1 03:29:59].
  // Genau diese Einnahmen haben `consumptionDay(taken_at) === targetDate`.
  const targetNext = new Date(`${targetDate}T12:00:00`);
  targetNext.setDate(targetNext.getDate() + 1);
  const targetNextStr = toLocalISO(targetNext).slice(0, 10);
  const dayStart = `${targetDate}T03:30:00`;
  const dayEnd = `${targetNextStr}T03:29:59`;

  // UNIX-Vergleich statt String-Vergleich: `first` und `last` sind Sekunden.
  // Wir brauchen `taken_at` als Unix, also den lokalen ISO-String in Sekunden
  // seit 1970-01-01 00:00:00 LOKAL umrechnen. Hilfsfunktion lokal:
  const localIsoToUnix = (s: string): number => {
    // "YYYY-MM-DDTHH:mm:ss" -> Date (lokal) -> Sekunden seit Epoch (geteilt durch 1000)
    // Wir nutzen new Date(s) — das interpretiert ISO-8601 ohne TZ als LOKAL
    // (in V8 genau das Verhalten, das wir hier brauchen).
    return new Date(s).getTime() / 1000;
  };

  const rows = db
    .prepare(
      `SELECT taken_at FROM intakes
       WHERE taken_at >= ? AND taken_at <= ?
       ORDER BY taken_at ASC`,
    )
    .all(dayStart, dayEnd) as { taken_at: string }[];

  // Einnahme-Zeitpunkte als Unix-Sekundenliste.
  const intakeUnixes = rows.map((r) => localIsoToUnix(r.taken_at));

  // `intakeFirst`: späteste Einnahme, die NACH 03:30 (Tagesbeginn) und
  // VOR `first` liegt. Das ist semantisch: "eine Medikamenten-Einnahme am
  // Vortag, BEVOR die erste PC-Interaktion gemeldet wurde" — der späteste
  // Hinweis darauf, dass der Mensch an diesem Tag bereits wach und aktiv
  // war. Wenn keine solche Einnahme existiert (alle Einnahmen liegen nach
  // `first`, oder es gibt keine) → null, und `first` wird übernommen.
  // Achtung: NICHT [first, last] — das wäre der falsche Bereich. Wir
  // suchen im Intervall [03:30, first).
  const dayStartUnix = localIsoToUnix(dayStart);
  const intakeFirst = (() => {
    let candidate: number | null = null;
    for (const u of intakeUnixes) {
      // Einnahmen sind aufsteigend; sobald wir >= first sind, können wir
      // abbrechen.
      if (u >= first) break;
      // muss nach 03:30 liegen (= nach Tagesbeginn)
      if (u >= dayStartUnix) candidate = u;
    }
    return candidate;
  })();

  // `intakeLast`: späteste Einnahme des Tages (unabhängig von `first`/`last`).
  const intakeLast = intakeUnixes.length > 0 ? intakeUnixes[intakeUnixes.length - 1] : null;

  // Endgültige Wachzeit-Grenzen.
  const wakeFirstUnix = intakeFirst != null ? intakeFirst : first;
  const wakeLastUnix = Math.max(intakeLast ?? -Infinity, last);

  const nowIso = nowLocalISO();
  const isoLast = unixToLocalISO(last);
  const isoFirst = unixToLocalISO(first);
  db.prepare(
    `INSERT INTO daily_habits (date, wake_first_unix, wake_last_unix, created_at, updated_at)
     VALUES (@date, @wakeFirst, @wakeLast, @now, @now)
     ON CONFLICT(date) DO UPDATE SET
       wake_first_unix = @wakeFirst,
       wake_last_unix  = @wakeLast,
       updated_at      = @now`,
  ).run({ date: targetDate, wakeFirst: wakeFirstUnix, wakeLast: wakeLastUnix, now: nowIso });

  const row = db.prepare(`SELECT * FROM daily_habits WHERE date = ?`).get(targetDate) as HabitRow;
  res.status(200).json({
    ...serializeHabit(row),
    // Debug-Felder — nützlich beim Smoke-Test des Crons und für die
    // Selbst-Diagnose des Algorithmus; bewusst kleines Payload.
    firstLocal: isoFirst,
    lastLocal: isoLast,
    firstDay: consumptionDayFromUnix(first),
    lastDay: consumptionDayFromUnix(last),
    targetDate,
    intakeFirstUnix: intakeFirst,
    intakeLastUnix: intakeLast,
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
      wakeFirstUnix: null,
      wakeLastUnix: null,
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
