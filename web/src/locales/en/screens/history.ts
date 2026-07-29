/**
 * English strings for the History screen. Typed against the German shape in
 * `de/screens/history.ts` — any key added there must be added here, otherwise
 * the build fails (intended safety net).
 */
export const history = {
  // Page header
  'history.title': 'History',
  'history.count': '{count} intakes recorded',
  'history.count.one': 'one intake recorded',
  'history.count.many': '{count} intakes recorded',

  // Filter chips
  'history.filterAll': 'All',

  // Empty state
  'history.empty.title': 'Nothing recorded yet',
  'history.empty.description': 'Recorded intakes appear here — grouped chronologically by day.',

  // Day grouping
  'history.entries': '{count} entries',
  'history.entries.one': 'one entry',
  'history.entries.many': '{count} entries',

  // Plan-match badge
  'history.planBadge': 'Plan',
  'history.planMatchTitle': 'Substance and dose match the active medication plan',

  // Edit sheet
  'history.field.time': 'Time',
  'history.field.amount': 'Amount',
  'history.field.amountPlaceholder': 'e.g. 150 mg',
  'history.field.note': 'Note',
  'history.field.notePlaceholder': 'Note …',

  // Toast messages
  'history.updated': 'Updated',
  'history.deleted': 'Deleted',
} as const;