import {
  nowLocalInput,
  parseLocal,
  toDateString,
  consumptionDay,
  consumptionToday,
  consumptionTodayOffset,
  DAY_BOUNDARY,
} from './time';
import { activeIntlLocale, activeLocale, translate, type Locale } from './i18n';

/** "YYYY-MM-DD" today. (Wall-clock day, WITHOUT the 03:30 day boundary —
 *  for the consumption day see `consumptionToday()`.) */
export function todayStr(): string {
  return toDateString(new Date());
}

/** Consumption/medication day per DAY_BOUNDARY (03:30 Europe/Berlin):
 *  00:00–03:29 count towards the previous day. */
export { consumptionDay, consumptionToday, consumptionTodayOffset, DAY_BOUNDARY };

/** "YYYY-MM-DD" n calendar days ago (wall-clock arithmetic). */
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

/**
 * `Intl` formatters, built per locale and memoised.
 *
 * Constructing an `Intl.DateTimeFormat` is comparatively expensive and these
 * run inside list renders, so we cache one instance per (locale, style) pair
 * instead of per call. The cache is keyed by locale, so switching language
 * just builds a second set rather than invalidating anything.
 */
type DateStyle = 'weekday' | 'dayMonth' | 'dayMonthShort' | 'full';

const STYLE_OPTIONS: Record<DateStyle, Intl.DateTimeFormatOptions> = {
  // "Mo., 9. Juni" / "Mon, 9 June" — the locale supplies its own punctuation,
  // so we never hand-append the German abbreviation dot.
  weekday: { weekday: 'short', day: 'numeric', month: 'long' },
  dayMonth: { day: 'numeric', month: 'long' },
  dayMonthShort: { day: 'numeric', month: 'short' },
  full: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
};

const fmtCache = new Map<string, Intl.DateTimeFormat>();

function fmt(style: DateStyle): Intl.DateTimeFormat {
  const tag = activeIntlLocale();
  const cacheKey = `${tag}:${style}`;
  let f = fmtCache.get(cacheKey);
  if (!f) {
    f = new Intl.DateTimeFormat(tag, STYLE_OPTIONS[style]);
    fmtCache.set(cacheKey, f);
  }
  return f;
}

/** The consumption day `offset` days from today (negative = past). */
function consumptionDayOffset(offset: number): string {
  const d = parseLocal(consumptionToday());
  d.setDate(d.getDate() + offset);
  return toDateString(d);
}

/**
 * True when `date` is the current consumption day.
 *
 * Use this instead of comparing a *formatted* label against a literal like
 * `'heute'` — that pattern silently breaks as soon as the label is translated.
 * Accepts both "YYYY-MM-DD" and full datetime strings.
 */
export function isConsumptionToday(date: string): boolean {
  return date.slice(0, 10) === consumptionToday();
}

/** "Today" / "Yesterday" / "Mon, 9 June" for a day group.
 *  Expects a date already resolved to the consumption day (i.e. run through
 *  `consumptionDay()` where the 03:30 boundary applies). */
export function formatDayLabel(date: string): string {
  // "Today" / "Yesterday" / "Tomorrow" refer to the consumption day (not the
  // plain wall-clock day), so an entry recorded at 02:30 that belongs to the
  // previous day shows up as "Yesterday" instead of wrongly as "Today".
  if (date === consumptionToday()) return translate('date.today');
  if (date === consumptionDayOffset(-1)) return translate('date.yesterday');
  if (date === consumptionDayOffset(1)) return translate('date.tomorrow');
  return fmt('weekday').format(parseLocal(date));
}

export function formatDayShort(date: string): string {
  return fmt('dayMonthShort').format(parseLocal(date));
}

export function formatMonthDay(date: string): string {
  return fmt('dayMonth').format(parseLocal(date));
}

export function formatFull(date: string): string {
  return fmt('full').format(parseLocal(date));
}

/** "HH:MM" from an effective date carrying a time ("YYYY-MM-DDTHH:mm"), else null. */
export function effectiveTimeOf(effective: string): string | null {
  return effective.length > 10 ? effective.slice(11, 16) : null;
}

/** "9 June" or "9 June, 14:00" — effective date with optional time. */
export function formatEffective(effective: string): string {
  const t = effectiveTimeOf(effective);
  const date = formatDayShort(effective);
  return t ? translate('date.atTime', { date, time: t }) : date;
}

/** "5 days ago", "yesterday", "today", "tomorrow", "in 5 days" — also accepts
 *  datetime strings. "today"/"yesterday"/"tomorrow" refer to the consumption day. */
export function relativeDays(date: string): string {
  date = date.slice(0, 10);
  const today = consumptionToday();
  if (date === today) return translate('date.todayLower');
  if (date === consumptionDayOffset(-1)) return translate('date.yesterdayLower');
  if (date === consumptionDayOffset(1)) return translate('date.tomorrowLower');
  const diff = Math.round((parseLocal(today).getTime() - parseLocal(date).getTime()) / 86400000);
  return diff > 0
    ? translate('date.daysAgo', { count: diff })
    : translate('date.inDays', { count: -diff });
}

export function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return translate('greeting.night');
  if (h < 11) return translate('greeting.morning');
  if (h < 17) return translate('greeting.day');
  if (h < 22) return translate('greeting.evening');
  return translate('greeting.night');
}

/** Current locale — re-exported so callers needing it for `Intl` don't have to
 *  import from two modules. */
export { activeLocale, type Locale };

/** Sensible default colour when a substance has none of its own (stable per name). */
export function colorForName(name: string): string {
  const palette = ['#5B8DB8', '#8E6BB0', '#D98E48', '#7EA46B', '#C9A14A', '#9C5C8A', '#5FA8A0', '#B5727A'];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}
