/**
 * English counterpart of `../de/common.ts`.
 *
 * Typed as `Record<keyof typeof deCommon, string>` in `../en/index.ts`, so
 * every key the German catalog defines must appear here — a missing or
 * misspelled key is a compile error, not a silent German fallback at runtime.
 */
export const common = {
  // ── navigation ──
  'nav.today': 'Today',
  'nav.history': 'History',
  'nav.dreams': 'Dreams',
  'nav.plan': 'Plan',
  'nav.values': 'Scales',
  'nav.stats': 'Stats',

  // ── generic actions ──
  'action.save': 'Save',
  'action.saving': 'Saving…',
  'action.cancel': 'Cancel',
  'action.delete': 'Delete',
  'action.undo': 'Undo',
  'action.close': 'Close',
  'action.open': 'Open',
  'action.edit': 'Edit',
  'action.add': 'Add',
  'action.retry': 'Try again',
  'action.refresh': 'Refresh',
  'action.back': 'Back',
  'action.more': 'Read more',
  'action.less': 'Show less',
  'action.now': 'Now',
  'action.today': 'Today',
  'action.confirm': 'Confirm',

  // ── generic state ──
  'state.loading': 'Loading…',
  'state.empty': 'Nothing here',
  'state.none': '—',
  'state.optional': 'optional',

  // ── relative dates ──
  'date.today': 'Today',
  'date.yesterday': 'Yesterday',
  'date.tomorrow': 'Tomorrow',
  'date.todayLower': 'today',
  'date.yesterdayLower': 'yesterday',
  'date.tomorrowLower': 'tomorrow',
  'date.daysAgo': '{count} days ago',
  'date.inDays': 'in {count} days',
  'date.atTime': '{date}, {time}',

  // ── greetings ──
  'greeting.night': 'Good night',
  'greeting.morning': 'Good morning',
  'greeting.day': 'Good afternoon',
  'greeting.evening': 'Good evening',

  // ── API errors ──
  'error.generic': 'Error {status}',
  'error.unreachable': 'Server unreachable. Check your connection and the server address.',
} as const;
