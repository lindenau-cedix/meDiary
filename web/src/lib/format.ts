import {
  nowLocalInput,
  parseLocal,
  toDateString,
  consumptionDay,
  consumptionToday,
  consumptionTodayOffset,
  DAY_BOUNDARY,
} from './time';

/** "YYYY-MM-DD" heute. (Wand­uhr-Tag, OHNE 03:30-Tagesgrenze —
 *  für Konsum-Tag siehe `consumptionToday()`.) */
export function todayStr(): string {
  return toDateString(new Date());
}

/** Konsum-/Medikations-Tag gemäß DAY_BOUNDARY (03:30 Europe/Berlin):
 *  00:00–03:29 zählen zum Vortag. */
export { consumptionDay, consumptionToday, consumptionTodayOffset, DAY_BOUNDARY };

/** "YYYY-MM-DD" vor n Kalendertagen (Wand­uhr-Berechnung). */
export function dateNDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toDateString(d);
}

export { nowLocalInput, parseLocal };

/** "22:15" */
export function formatTime(takenAt: string): string {
  return takenAt.slice(11, 16);
}

const weekdayFmt = new Intl.DateTimeFormat('de-DE', { weekday: 'short' });
const dayMonthFmt = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long' });
const dayMonthShortFmt = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short' });
const fullFmt = new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

/** "Heute" / "Gestern" / "Mo., 9. Juni" für eine Tages-Gruppe.
 *  Erwartet ein Datum im Konsum-Tag-Format (also bereits durch
 *  `consumptionDay()` aufgelöst, falls die 03:30-Grenze greift). */
export function formatDayLabel(date: string): string {
  // "Heute" / "Gestern" / "Morgen" beziehen sich auf den Konsum-Tag
  // (nicht den reinen Wand­uhr-Tag), damit ein um 02:30 erfasster
  // Eintrag, der zum Vortag gehört, dort als "Gestern" erscheint und
  // nicht falsch als "Heute".
  const today = consumptionToday();
  if (date === today) return 'Heute';
  const yesterday = (() => {
    const d = parseLocal(today);
    d.setDate(d.getDate() - 1);
    return toDateString(d);
  })();
  const tomorrow = (() => {
    const d = parseLocal(today);
    d.setDate(d.getDate() + 1);
    return toDateString(d);
  })();
  if (date === yesterday) return 'Gestern';
  if (date === tomorrow) return 'Morgen';
  const d = parseLocal(date);
  return `${weekdayFmt.format(d)}., ${dayMonthFmt.format(d)}`;
}

export function formatDayShort(date: string): string {
  const d = parseLocal(date);
  return dayMonthShortFmt.format(d);
}

export function formatFull(date: string): string {
  return fullFmt.format(parseLocal(date));
}

/** "HH:MM" aus einem Wirkungsdatum mit Uhrzeit ("YYYY-MM-DDTHH:mm"), sonst null. */
export function effectiveTimeOf(effective: string): string | null {
  return effective.length > 10 ? effective.slice(11, 16) : null;
}

/** "9. Juni" bzw. "9. Juni, 14:00 Uhr" — Wirkungsdatum mit optionaler Uhrzeit. */
export function formatEffective(effective: string): string {
  const t = effectiveTimeOf(effective);
  return t ? `${formatDayShort(effective)}, ${t} Uhr` : formatDayShort(effective);
}

/** "vor 5 Tagen", "gestern", "heute", "morgen", "in 5 Tagen" — akzeptiert auch Datetime-Strings.
 *  "heute"/"gestern"/"morgen" beziehen sich auf den Konsum-Tag. */
export function relativeDays(date: string): string {
  date = date.slice(0, 10);
  const today = consumptionToday();
  if (date === today) return 'heute';
  if (date === (() => { const d = parseLocal(today); d.setDate(d.getDate() - 1); return toDateString(d); })())
    return 'gestern';
  if (date === (() => { const d = parseLocal(today); d.setDate(d.getDate() + 1); return toDateString(d); })())
    return 'morgen';
  const diff = Math.round((parseLocal(today).getTime() - parseLocal(date).getTime()) / 86400000);
  if (diff > 0) return `vor ${diff} Tagen`;
  return `in ${-diff} Tagen`;
}

export function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Gute Nacht';
  if (h < 11) return 'Guten Morgen';
  if (h < 17) return 'Guten Tag';
  if (h < 22) return 'Guten Abend';
  return 'Gute Nacht';
}

/** sinnvolle Default-Farbe, falls Substanz keine eigene hat (stabil pro Name). */
export function colorForName(name: string): string {
  const palette = ['#5B8DB8', '#8E6BB0', '#D98E48', '#7EA46B', '#C9A14A', '#9C5C8A', '#5FA8A0', '#B5727A'];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}
