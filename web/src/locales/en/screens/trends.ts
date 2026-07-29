/**
 * English counterpart of `../../de/screens/trends.ts`.
 *
 * The picker note embeds a `<strong>` tag for "consumption day"; HTML inside
 * the catalog is intentional and renders as-is in the JSX paragraph.
 */
export const trends = {
  // ── page header ──
  'trends.eyebrow': '{count} assessments · {range} days',
  'trends.eyebrowCount.one': '{count} assessment',
  'trends.eyebrowCount.many': '{count} assessments',

  // ── list section ──
  'trends.list.heading': 'Assessments in this period',

  // ── empty state ──
  'trends.empty.title': 'No assessments yet',
  'trends.empty.description':
    'Once your night medication is logged, you will be asked about your day — or add one now.',
  'trends.empty.action': 'Add assessment',

  // ── charts section ──
  'trends.charts.heading': '11 scales — trends',

  // ── today hero ──
  'trends.today.eyebrow': 'Today · {date}',
  'trends.today.filled': '{filled}/{total} scores · avg {avg}',
  'trends.today.filledNoAvg': '{filled}/{total} scores',
  'trends.today.empty': 'Not logged yet',

  // ── row meta ──
  'trends.row.meta': '{date} · {relative}',
  'trends.row.summaryWithAvg': '{filled}/{total} · avg {avg}',
  'trends.row.summaryNoAvg': '{filled}/{total}',

  // ── date picker sheet ──
  'trends.picker.title': 'Add assessment',
  'trends.picker.subtitle': 'Pick a consumption day (day boundary 03:30)',
  'trends.picker.field.date': 'Date',
  'trends.picker.quickHeading': 'Quick pick',
  'trends.picker.quick.today': 'Today',
  'trends.picker.quick.yesterday': 'Yesterday',
  'trends.picker.quick.dayBefore': 'Day before',
  'trends.picker.quick.sevenAgo': '7 days ago',
  'trends.picker.note':
    'Note: the server works with <strong>consumption days</strong> (day boundary 03:30). Entries between 00:00 and 03:29 count towards the previous day — logging your night medication automatically picks the matching consumption day.',
} as const;