/**
 * German strings for the Trends screen — the 11-scale assessment history,
 * the today hero card, and the date-picker sheet.
 */
export const trends = {
  // ── page header ──
  'trends.eyebrow': '{count} Tagesbilder · {range} Tage',
  'trends.eyebrowCount.one': '{count} Tagesbild',
  'trends.eyebrowCount.many': '{count} Tagesbilder',

  // ── list section ──
  'trends.list.heading': 'Tagesbilder im Zeitraum',

  // ── empty state ──
  'trends.empty.title': 'Noch keine Tagesbilder',
  'trends.empty.description':
    'Nach dem Eintragen der Nachtmedikation wirst du nach deinem Tag gefragt — oder lege jetzt eines an.',
  'trends.empty.action': 'Tagesbild anlegen',

  // ── charts section ──
  'trends.charts.heading': '11 Skalen — Trends',

  // ── today hero ──
  'trends.today.eyebrow': 'Heute · {date}',
  'trends.today.filled': '{filled}/{total} Werte · Ø {avg}',
  'trends.today.filledNoAvg': '{filled}/{total} Werte',
  'trends.today.empty': 'Noch nicht erfasst',

  // ── row meta ──
  'trends.row.meta': '{date} · {relative}',
  'trends.row.summaryWithAvg': '{filled}/{total} · Ø {avg}',
  'trends.row.summaryNoAvg': '{filled}/{total}',

  // ── date picker sheet ──
  'trends.picker.title': 'Tagesbild anlegen',
  'trends.picker.subtitle': 'Wähle einen Konsum-Tag (Tagesgrenze 03:30)',
  'trends.picker.field.date': 'Datum',
  'trends.picker.quickHeading': 'Schnellauswahl',
  'trends.picker.quick.today': 'Heute',
  'trends.picker.quick.yesterday': 'Gestern',
  'trends.picker.quick.dayBefore': 'Vorgestern',
  'trends.picker.quick.sevenAgo': 'Vor 7 Tagen',
  'trends.picker.note':
    'Hinweis: Der Server arbeitet mit <strong>Konsum-Tagen</strong> (Tagesgrenze 03:30). Eine Eingabe 00:00–03:29 zählt zum Vortag — beim Eintragen der Nachtmedikation wird der passende Konsum-Tag automatisch gesetzt.',
} as const;