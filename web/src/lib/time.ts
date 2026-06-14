/**
 * Zeit-Helfer für die Frontend-Tageslogik. Spiegelt die Server-Seite
 * (`server/src/lib/time.ts`): lokale Wand­uhr-Zeiten als Strings
 * ("YYYY-MM-DDTHH:mm[:ss]"), Tagesgrenze 03:30 Europe/Berlin
 * (`DAY_BOUNDARY`). Einnahmen 00:00–03:29 zählen zum Vortag.
 *
 * Der Server setzt in `serializeIntake` bereits den korrekten
 * Konsum-Tag (`intake.date`); diese Helfer werden im Frontend vor
 * allem gebraucht, um "heute" / "gestern" / "morgen" konsistent zur
 * 03:30-Grenze zu bestimmen, wenn kein Server-Wert vorliegt (z. B. die
 * Default-Auswahl im Composer oder der "Heute"-Button im
 * Assessment-Sheet).
 */

export const DAY_BOUNDARY = { hour: 3, minute: 30 } as const;

/** Tagesdatum "YYYY-MM-DD" aus einem lokalen Datetime-String. */
export function dateOf(localDateTime: string): string {
  return localDateTime.slice(0, 10);
}

/** Stunde (0–23) aus einem lokalen Datetime-String. */
export function hourOf(localDateTime: string): number {
  return Number(localDateTime.slice(11, 13));
}

/** Minuten (0–59) aus einem lokalen Datetime-String. */
export function minuteOf(localDateTime: string): number {
  return Number(localDateTime.slice(14, 16));
}

/**
 * Konsum-/Medikations-Tag eines Zeitpunkts (Tagesgrenze siehe
 * `DAY_BOUNDARY`). Akzeptiert sowohl "YYYY-MM-DDTHH:mm" als auch
 * "YYYY-MM-DDTHH:mm:ss" — verhält sich exakt wie der Server-Helfer.
 */
export function consumptionDay(localDateTime: string): string {
  const day = dateOf(localDateTime);
  const minutes = hourOf(localDateTime) * 60 + minuteOf(localDateTime);
  if (minutes < DAY_BOUNDARY.hour * 60 + DAY_BOUNDARY.minute) {
    const d = parseLocal(day);
    d.setDate(d.getDate() - 1);
    return toDateString(d);
  }
  return day;
}

/** Aktueller Konsum-Tag ("YYYY-MM-DD") gemäß DAY_BOUNDARY. */
export function consumptionToday(): string {
  return consumptionDay(nowLocalInput() + ':00');
}

/** Konsum-Tag vor n Kalendertagen — Basis `consumptionToday()`,
 *  NICHT der reine Wand­uhr-Tag. Für „Liste der letzten N
 *  Konsum-Tage" als Server-Filter nutzbar. */
export function consumptionTodayOffset(n: number): string {
  const d = parseLocal(consumptionToday());
  d.setDate(d.getDate() - n);
  return toDateString(d);
}

/** "YYYY-MM-DD" aus einem Date-Objekt (lokale Zeit). */
export function toDateString(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parst "YYYY-MM-DDTHH:mm[:ss]" als lokale Zeit. */
export function parseLocal(s: string): Date {
  const [datePart, timePart = '00:00:00'] = s.split('T');
  const [y, mo, da] = datePart.split('-').map(Number);
  const [h, mi, se = 0] = timePart.split(':').map(Number);
  return new Date(y, mo - 1, da, h, mi, se);
}

/** "YYYY-MM-DDTHH:mm" der aktuellen lokalen Zeit. */
export function nowLocalInput(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
