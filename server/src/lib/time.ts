/**
 * Zeit-Helfer. meDiary speichert lokale Wand­uhr-Zeiten als
 * "YYYY-MM-DDTHH:mm:ss" Strings, damit es in einer einzelnen Zeitzone
 * keinerlei Offset-Überraschungen gibt (persönliches Tagebuch, Single-User).
 */

/** Aktuelle lokale Zeit als "YYYY-MM-DDTHH:mm:ss". */
export function nowLocalISO(): string {
  return toLocalISO(new Date());
}

export function toLocalISO(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

/**
 * Unix-Timestamp (Sekunden, float erlaubt) in lokale Wand­uhr-Zeit
 * "YYYY-MM-DDTHH:mm:ss" umwandeln. Liefert null bei NaN/negativ.
 */
export function unixToLocalISO(unix: number): string | null {
  if (!Number.isFinite(unix) || unix < 0) return null;
  return toLocalISO(new Date(unix * 1000));
}

/** Aktuelle lokale Zeit als Unix-Timestamp (Sekunden, float). */
export function nowUnix(): number {
  return Date.now() / 1000;
}

/**
 * Konsum-Tag für einen Unix-Timestamp — gleiche 03:30-Grenze wie
 * `consumptionDay()`. null bei ungültigem Input.
 */
export function consumptionDayFromUnix(unix: number): string | null {
  const iso = unixToLocalISO(unix);
  return iso ? consumptionDay(iso) : null;
}

/** Tagesdatum "YYYY-MM-DD" aus einem lokalen Datetime-String. */
export function dateOf(localDateTime: string): string {
  return localDateTime.slice(0, 10);
}

/** Stunde (0-23) aus einem lokalen Datetime-String. */
export function hourOf(localDateTime: string): number {
  return Number(localDateTime.slice(11, 13));
}

/**
 * Tagesgrenze des Konsum-/Medikations-Tages: 03:30 (Europe/Berlin).
 * Zeiten werden als lokale Wanduhrzeit gespeichert; für einen Nutzer in
 * Europe/Berlin entspricht die lokale Zeit dieser Zeitzone. Einnahmen
 * zwischen 00:00 und 03:29 zählen für Tages-Attributionen (z. B. das
 * Tagesbild) zum vorherigen Konsum-Tag — exakte Uhrzeiten bleiben
 * kalendergenau gespeichert.
 */
export const DAY_BOUNDARY = { hour: 3, minute: 30 } as const;

/** Konsum-/Medikations-Tag eines Zeitpunkts (Tagesgrenze siehe DAY_BOUNDARY). */
export function consumptionDay(takenAtLocal: string): string {
  const day = dateOf(takenAtLocal);
  const minutes = hourOf(takenAtLocal) * 60 + Number(takenAtLocal.slice(14, 16));
  if (minutes < DAY_BOUNDARY.hour * 60 + DAY_BOUNDARY.minute) {
    const d = new Date(`${day}T12:00:00`);
    d.setDate(d.getDate() - 1);
    return dateOf(toLocalISO(d));
  }
  return day;
}

/**
 * Tag, dem das Tagesbild einer Nachtmedikation zugeordnet wird – entspricht
 * dem Konsum-Tag (Einnahmen vor 03:30 betreffen die zurückliegende Nacht).
 */
export function assessmentDateForIntake(takenAtLocal: string): string {
  return consumptionDay(takenAtLocal);
}

/** Normalisiert verschiedene Eingabeformate auf "YYYY-MM-DDTHH:mm:ss". */
export function normalizeDateTime(input: string): string {
  // datetime-local liefert "YYYY-MM-DDTHH:mm" -> Sekunden ergänzen
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input)) return `${input}:00`;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(input)) return input;
  // ISO mit Zeitzone -> in lokale Wanduhrzeit umwandeln
  const d = new Date(input);
  if (!Number.isNaN(d.getTime())) return toLocalISO(d);
  throw new Error(`Ungültiges Datum/Zeit-Format: ${input}`);
}
