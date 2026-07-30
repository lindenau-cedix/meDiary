/**
 * English counterpart of `./quickEntry.ts`. Key coverage is enforced by the
 * `Messages` annotation in `../index.ts` — a missing or misspelled key fails
 * the type check rather than shipping as a silent German fallback.
 */
export const quickEntry = {
  // ── page header & navigation ──
  'quickEntry.title': 'Today',
  'quickEntry.consoleLabel': 'Data console',
  'quickEntry.settingsLabel': 'Settings',

  // ── offline banner ──
  'quickEntry.offlineTitle': 'Server unreachable',
  'quickEntry.offlineDetail': 'Check the address in Settings.',

  // ── DEFAULTS-compliance warning ──
  'quickEntry.missingDefaults.one': '1 substance without a DEFAULTS entry',
  'quickEntry.missingDefaults.many': '{count} substances without a DEFAULTS entry',
  'quickEntry.missingDefaultsDetail':
    'These substances do not get a default note or amount when logged. Add them under “Standard notes” in Settings.',
  'quickEntry.maintain': 'Add entries',

  // ── composer (shared timestamp + per-substance row) ──
  'quickEntry.composerHint':
    'Tap a substance below — amount and note will appear here, the timestamp applies to all of them.',
  'quickEntry.composerHintLongPress':
    'Long-press logs a substance right away with its default values.',
  'quickEntry.amountLabel': 'Amount',
  'quickEntry.amountAria': 'Amount {name}',
  'quickEntry.noteLabel': 'Note',
  'quickEntry.noteWithDefault': 'Note (default set)',
  'quickEntry.noteAria': 'Note {name}',
  'quickEntry.removeSubstanceAria': 'Remove {name}',
  'quickEntry.defaultLabel': 'Default:',
  'quickEntry.alsoAdded': 'Auto-added:',

  // ── sort & manage header ──
  'quickEntry.sortHeader': 'Pick a substance',
  'quickEntry.sortHeaderActive': 'Drag to reorder',
  'quickEntry.done': 'Done',
  'quickEntry.sort': 'Sort',
  'quickEntry.manage': 'Manage',
  'quickEntry.sortManual': 'Manual',
  'quickEntry.sortFrequency': 'Frequency',
  'quickEntry.sortModeHint':
    'Drag the handle to reorder — your changes are saved automatically.',
  'quickEntry.dragHandleAria': 'Drag to sort',

  // ── plan-batch tiles (collective entries) ──
  'quickEntry.planBatch.morning': 'Morning meds',
  'quickEntry.planBatch.noon': 'Midday meds',
  'quickEntry.planBatch.evening': 'Evening meds',
  'quickEntry.planBatch.night': 'Night meds',
  'quickEntry.planBatch.entryCount.one': '1 entry',
  'quickEntry.planBatch.entryCount.many': '{count} entries',
  'quickEntry.planBatch.tileTitle': 'Log all {count} plan entries at once',

  // ── substance tile (grid) ──
  'quickEntry.addSubstance': 'Substance',
  'quickEntry.missingDefaultTooltip': 'No DEFAULTS entry — add one in Settings',
  'quickEntry.missingDefaultAria': 'No DEFAULTS entry',
  'quickEntry.inPlanTooltip': 'Part of the current medication plan',
  'quickEntry.frequencyTooltip': 'Logged {count}× in the last 90 days',
  'quickEntry.frequencyShort': '{count}× last 90 d.',

  // ── empty state ──
  'quickEntry.emptyHint':
    'Add your first substance to start logging with a single tap.',

  // ── "Heute erfasst" list ──
  'quickEntry.loggedToday': 'Logged today',
  'quickEntry.showAll': 'all',
  'quickEntry.planBadgeTitle':
    'Substance and dose match the current medication plan',
  'quickEntry.planBadgeLabel': 'Plan',

  // ── floating confirm bar (collective selection) ──
  'quickEntry.selectedCount.many': '{count} substances',
  'quickEntry.takenAtTime': '{time}',
  'quickEntry.discardSelectionAria': 'Discard selection',
  'quickEntry.record': 'Record',

  // ── toasts ──
  'quickEntry.toast.saved': '{name} logged',
  'quickEntry.toast.savedCount': '{count} entries logged',
  'quickEntry.toast.batchSaved': '{label} logged',
  'quickEntry.toast.batchEmpty': '{label}: nothing logged',
  'quickEntry.toast.batchEmptyDetail':
    'No entries are scheduled for this slot in the current plan.',
  'quickEntry.toast.failed': 'Entry failed',
} as const;
