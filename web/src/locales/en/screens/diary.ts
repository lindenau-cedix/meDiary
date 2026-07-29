/**
 * English strings for the Diary screen. Typed against the German shape in
 * `de/screens/diary.ts` — any key added there must be added here, otherwise
 * the build fails (intended safety net).
 */
export const diary = {
  // Page header
  'diary.title': 'Diary',
  'diary.eyebrow.info': 'from your notes',
  'diary.eyebrow.dreams': 'nightly review',

  // Subtab toggle
  'diary.tab.info': 'Info',
  'diary.tab.dreams': 'Dreams',

  // Info subtab empty state
  'diary.empty.title': 'No notes yet',
  'diary.empty.description':
    'Notes from intakes and daily assessments appear here — chronologically by day.',

  // Per-day section blocks
  'diary.assessment': 'Assessment',
  'diary.wake': 'Wake',
  'diary.wakeUnit': 'awake',
  'diary.wakeFirst': 'first awake',
  'diary.wakeLast': 'last awake',
} as const;