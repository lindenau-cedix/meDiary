/**
 * English counterpart of `../../de/screens/plan.ts`.
 *
 * Shape parity is enforced by the `Messages` annotation in `../index.ts`, so
 * every key and placeholder must match the German catalog.
 */
export const plan = {
  // ── page header ──
  'plan.eyebrow.noPlan': 'Medication plan',
  'plan.eyebrow.effectiveToday': 'today',
  'plan.eyebrow.effectiveTodayAt': 'today, {time}',
  'plan.eyebrow.effectiveSince': 'In effect since {date}',

  // ── upcoming change card ──
  'plan.upcoming.title': 'Scheduled change',
  'plan.upcoming.row': 'From {date} ({relative})',
  'plan.upcoming.withNote': 'From {date} ({relative}): {note}',
  'plan.upcoming.itemCount.one': '{count} entry',
  'plan.upcoming.itemCount.many': '{count} entries',

  // ── empty state ──
  'plan.empty.title': 'No plan yet',
  'plan.empty.description':
    'Set up your medication plan. Every change is recorded as a dated version.',
  'plan.empty.action': 'Create plan',

  // ── last change footer ──
  'plan.lastChange': 'Last change: {note}',

  // ── compare section ──
  'plan.compare.heading': 'What changed?',
  'plan.compare.range.one': '{count} day',
  'plan.compare.range.many': '{count} days',
  'plan.compare.loading': 'Comparing …',
  'plan.compare.unchanged': 'Unchanged from {date}.',
  'plan.compare.unchangedFallback': 'Unchanged from {days} days ago.',
  'plan.compare.header': 'Comparison with {date}',
  'plan.compare.headerFallback': 'Comparison with {days} days ago',
  'plan.diff.added': 'newly added',
  'plan.diff.removed': 'discontinued',

  // ── version history ──
  'plan.versions.heading': 'Version history',
  'plan.versions.noteFallbackActive': 'Current version',
  'plan.versions.noteFallbackOther': 'Plan adjustment',
  'plan.versions.summary': 'in effect from {date} · {count} · {relative}',
  'plan.versions.summaryCount.one': '{count} entry',
  'plan.versions.summaryCount.many': '{count} entries',
  'plan.versions.badge.active': 'active',
  'plan.versions.badge.upcoming': 'scheduled',

  // ── snapshot sheet ──
  'plan.snapshot.titleFallback': 'Plan version',
  'plan.snapshot.subtitle': 'In effect from {date}, {time}',
  'plan.snapshot.subtitleDateOnly': 'In effect from {date}',
  'plan.snapshot.loading': 'Loading …',

  // ── editor sheet ──
  'plan.editor.title': 'Edit plan',
  'plan.editor.subtitle': 'New version — retroactive, from today, or with a future date',
  'plan.editor.addRow': 'Row',
  'plan.editor.row.remove': 'Remove row',
  'plan.editor.placeholder.substance': 'Substance',
  'plan.editor.placeholder.strength': 'Strength',
  'plan.editor.placeholder.slot': '0',
  'plan.editor.placeholder.reason': 'Reason (optional)',
  'plan.editor.placeholder.notes': 'Note (optional)',
  'plan.editor.field.effectiveFrom': 'Effective from',
  'plan.editor.field.effectiveAt': 'Time (optional)',
  'plan.editor.hint.timeOptional': 'Time is optional — leave blank to take effect at the start of the day.',
  'plan.editor.field.changeNote': 'Change note',
  'plan.editor.placeholder.changeNote': 'e.g. quetiapine raised from 100 to 150 mg',

  // ── effective-date hint ──
  'plan.editor.hint.past': 'Retroactive — already in effect since {date} ({relative}).',
  'plan.editor.hint.future': 'Scheduled — takes effect {relative}{atTime}; until then the current plan stays active.',
  'plan.editor.hint.futureAtTime': ' at {time}',
  'plan.editor.hint.todayAtTime': 'Takes effect today, {time}.',
  'plan.editor.hint.today': 'Takes effect today.',

  // ── save toast ──
  'plan.save.toast': 'Plan saved',
  'plan.save.toastDetail': '{count} · in effect from {effective}',
  'plan.save.toastCount.one': '{count} entry',
  'plan.save.toastCount.many': '{count} entries',
  'plan.save.toastEffectiveToday': 'today',
} as const;