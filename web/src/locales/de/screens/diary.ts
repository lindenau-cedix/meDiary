/**
 * German strings for the Diary ("Tagebuch") screen, including the Info
 * subtab (raw notes log) and the Dreams subtab (sent-dreams log).
 *
 * The "more"/"less" labels reuse `action.more` / `action.less` from the
 * common catalog so they stay consistent with other read-more disclosures.
 *
 * Keys are merged flat via `web/src/locales/de/index.ts`; the English mirror
 * lives next door (`en/screens/diary.ts`) and is type-checked against this
 * shape, so any key added here must be added there too.
 */
export const diary = {
  // Page header
  'diary.title': 'Tagebuch',
  'diary.eyebrow.info': 'aus deinen Notizen',
  'diary.eyebrow.dreams': 'nächtliche Auswertung',

  // Subtab toggle
  'diary.tab.info': 'Info',
  'diary.tab.dreams': 'Traum',

  // Info subtab empty state
  'diary.empty.title': 'Noch keine Notizen',
  'diary.empty.description':
    'Notizen aus Einnahmen und Tagesbildern erscheinen hier — chronologisch nach Tagen.',

  // Per-day section blocks
  'diary.assessment': 'Tagesbild',
  'diary.wake': 'Wachzeit',
  'diary.wakeUnit': 'wach',
  'diary.wakeFirst': 'zuerst wach',
  'diary.wakeLast': 'zuletzt wach',
} as const;