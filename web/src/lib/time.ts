/**
 * Time helpers for the frontend's day logic. Mirrors the server side
 * (`server/src/lib/time.ts`): local wall-clock times as strings
 * ("YYYY-MM-DDTHH:mm[:ss]"), day boundary 03:30 Europe/Berlin
 * (`DAY_BOUNDARY`). Intakes 00:00–03:29 count towards the previous day.
 *
 * The server already sets the correct consumption day (`intake.date`) in
 * `serializeIntake`; these helpers are mostly used in the frontend to
 * determine "today" / "yesterday" / "tomorrow" consistently with the
 * 03:30 boundary when no server value is available (e.g. the default
 * selection in the composer or the "Today" button in the assessment
 * sheet).
 */

export const DAY_BOUNDARY = { hour: 3, minute: 30 } as const;

/** Day date "YYYY-MM-DD" from a local datetime string. */
export function dateOf(localDateTime: string): string {
  return localDateTime.slice(0, 10);
}

/** Hour (0–23) from a local datetime string. */
export function hourOf(localDateTime: string): number {
  return Number(localDateTime.slice(11, 13));
}

/** Minute (0–59) from a local datetime string. */
export function minuteOf(localDateTime: string): number {
  return Number(localDateTime.slice(14, 16));
}

/**
 * Consumption/medication day of a given timestamp (day boundary see
 * `DAY_BOUNDARY`). Accepts both "YYYY-MM-DDTHH:mm" and
 * "YYYY-MM-DDTHH:mm:ss" — behaves exactly like the server helper.
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

/** Current consumption day ("YYYY-MM-DD") per DAY_BOUNDARY. */
export function consumptionToday(): string {
  return consumptionDay(nowLocalInput() + ':00');
}

/** Consumption day n calendar days ago — base `consumptionToday()`,
 *  NOT the plain wall-clock day. Useful as a server filter for "list of
 *  the last N consumption days". */
export function consumptionTodayOffset(n: number): string {
  const d = parseLocal(consumptionToday());
  d.setDate(d.getDate() - n);
  return toDateString(d);
}

/** "YYYY-MM-DD" from a Date object (local time). */
export function toDateString(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parse "YYYY-MM-DDTHH:mm[:ss]" as local time. */
export function parseLocal(s: string): Date {
  const [datePart, timePart = '00:00:00'] = s.split('T');
  const [y, mo, da] = datePart.split('-').map(Number);
  const [h, mi, se = 0] = timePart.split(':').map(Number);
  return new Date(y, mo - 1, da, h, mi, se);
}

/** "YYYY-MM-DDTHH:mm" of the current local time. */
export function nowLocalInput(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
