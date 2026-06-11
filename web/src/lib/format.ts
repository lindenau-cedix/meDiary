const pad = (n: number) => String(n).padStart(2, '0');

/** "YYYY-MM-DDTHH:mm" der aktuellen lokalen Zeit (für <input datetime-local>). */
export function nowLocalInput(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "YYYY-MM-DD" heute. */
export function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function dateNDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parst "YYYY-MM-DDTHH:mm[:ss]" als lokale Zeit. */
export function parseLocal(s: string): Date {
  const [datePart, timePart = '00:00:00'] = s.split('T');
  const [y, mo, da] = datePart.split('-').map(Number);
  const [h, mi, se = 0] = timePart.split(':').map(Number);
  return new Date(y, mo - 1, da, h, mi, se);
}

/** "22:15" */
export function formatTime(takenAt: string): string {
  return takenAt.slice(11, 16);
}

const weekdayFmt = new Intl.DateTimeFormat('de-DE', { weekday: 'short' });
const dayMonthFmt = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long' });
const dayMonthShortFmt = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short' });
const fullFmt = new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

/** "Heute" / "Gestern" / "Mo., 9. Juni" für eine Tages-Gruppe. */
export function formatDayLabel(date: string): string {
  const today = todayStr();
  if (date === today) return 'Heute';
  if (date === dateNDaysAgo(1)) return 'Gestern';
  if (date === dateNDaysAgo(-1)) return 'Morgen';
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

/** "vor 5 Tagen", "gestern", "heute", "morgen", "in 5 Tagen" */
export function relativeDays(date: string): string {
  const today = todayStr();
  if (date === today) return 'heute';
  if (date === dateNDaysAgo(1)) return 'gestern';
  if (date === dateNDaysAgo(-1)) return 'morgen';
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
