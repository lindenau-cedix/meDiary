/**
 * English counterpart of `./console.ts`. Key coverage is enforced by the
 * `Messages` annotation in `../index.ts` — a missing or misspelled key fails
 * the type check rather than shipping as a silent German fallback.
 */
export const console_ = {
  // ── page header ──
  'console.title': 'Console',
  'console.eyebrow': 'Data console',
  'console.historyAria': 'Change history',
  'console.settingsAria': 'Settings',

  // ── status banners ──
  'console.offline.title': 'Server unreachable',
  'console.offline.detail': 'Check the address in Settings.',
  'console.unconfigured.title': 'Console not configured',
  'console.unconfigured.detail':
    'Set CHAT_API_KEY (or MINIMAX_API_KEY) in .env to enable the data console. Reading and viewing work without a key.',

  // ── composer ──
  'console.placeholder': 'Ask a question or describe a correction …',
  'console.sendAria': 'Send',
  'console.stopAria': 'Stop',
  'console.composerHint': '⏎ send · ⇧⏎ new line · preview before every change',

  // ── transcript ──
  'console.thinking': 'thinking …',
  'console.tool.schema': 'Schema',
  'console.tool.query': 'Query',
  'console.tool.proposal': 'Proposal',

  // ── empty state ──
  'console.empty.eyebrow': 'Examples',
  'console.empty.description':
    'Inspect your data or describe a correction in your own words. Changes are shown as a preview first — nothing is written without your confirmation.',
  'console.empty.example.1':
    'Merge “Magnesium citrate” and “Magnesium” into one substance and keep all intakes.',
  'console.empty.example.2':
    'I forgot to log vitamin D — log it on every weekday of the last two weeks at 09:00.',
  'console.empty.example.3': 'Delete every intake before 2026-01-01.',
  'console.empty.example.4':
    'My trip intakes are a day late because of the timezone — shift all entries tagged “Tokyo” back by 24 hours.',
  'console.empty.example.5': 'Which substances have I not logged for over a month?',

  // ── change-set card ──
  'console.changeSet.affected.one': '{count} row affected',
  'console.changeSet.affected.many': '{count} rows affected',
  'console.changeSet.operations': '{count} operations',
  'console.changeSet.confirmLarge': 'Really change {count} rows?',
  'console.changeSet.status.proposed': 'Proposal',
  'console.changeSet.status.applied': 'Applied',
  'console.changeSet.status.undone': 'Undone',
  'console.changeSet.status.discarded': 'Discarded',
  'console.changeSet.applied': 'Applied',
  'console.changeSet.undoOnlyLatest': 'only the latest change can be undone',

  // ── toasts ──
  'console.toast.applied': 'Change applied',
  'console.toast.appliedDetail.one': '{count} row changed',
  'console.toast.appliedDetail.many': '{count} rows changed',
  'console.toast.applyFailed': 'Apply failed',
  'console.toast.undone': 'Reverted',
  'console.toast.undoFailed': 'Undo failed',
  'console.toast.discardFailed': 'Discard failed',

  // ── audit log ──
  'console.audit.title': 'Change history',
  'console.audit.subtitle': 'Console audit log',
  'console.audit.empty': 'No changes yet.',
  'console.audit.rows.one': '{count} row',
  'console.audit.rows.many': '{count} rows',
  'console.audit.reversible': 'reversible',

  // ── diff table ──
  'console.diff.empty': 'No affected rows.',
  'console.diff.truncated': '… showing only {shown} of {total} rows',
  'console.diff.field.substance': 'Substance',
  'console.diff.field.takenAt': 'Time',
  'console.diff.field.amount': 'Amount',
  'console.diff.field.notes': 'Note',
  'console.diff.field.name': 'Name',
  'console.diff.field.archived': 'Archived',
  'console.diff.field.isNightMed': 'Night med',
} as const;