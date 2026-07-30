/**
 * English counterpart of `./defaults.ts`. Key coverage is enforced by the
 * `Messages` annotation in `../index.ts` — a missing or misspelled key fails
 * the type check rather than shipping as a silent German fallback.
 *
 * The editor round-trips a Markdown file: substance names, amounts, note
 * text and the `Mit:` companion keyword are DATA and must never be
 * translated. Only the UI chrome around them lives here.
 */
export const defaults = {
  // ── screen header ──
  'defaults.back': 'Back to Settings',
  'defaults.title': 'Standard notes',
  'defaults.eyebrow': 'Applied automatically as note and amount',

  // ── tab switcher ──
  'defaults.tab.structured': 'Structured',
  'defaults.tab.raw': 'Advanced (Markdown)',

  // ── structured view: empty state ──
  'defaults.empty.title': 'No substances in DEFAULTS.md yet.',
  'defaults.empty.addBlank': 'Add blank section',
  'defaults.empty.addWithTile': 'Add substance with tile',

  // ── structured view: actions ──
  'defaults.action.addSection': 'New section',
  'defaults.action.addWithTile': '+ substance with tile',
  'defaults.action.deleteAria': 'Delete section',
  'defaults.action.deleteTitle': 'Delete section',

  // ── structured view: confirm dialog ──
  'defaults.confirm.removeSection': 'Really remove section "{name}"?',

  // ── structured view: prefill chip ──
  'defaults.prefill.title': 'New section: {name}',
  'defaults.prefill.detail': 'Just added from the compliance report — please complete amount and note.',
  'defaults.prefill.create': 'Create',
  'defaults.prefill.discard': 'Discard',

  // ── structured view: compliance suggestion ──
  'defaults.compliance.eyebrow': 'Suggested from compliance',
  'defaults.compliance.suggestionCount': '({count}×)',
  'defaults.compliance.summaryLoading': 'Loading compliance report …',
  'defaults.compliance.withEntry': '{count} with entry',
  'defaults.compliance.withoutEntry': '{count} without entry',
  'defaults.compliance.fullyCovered': 'Fully covered',
  'defaults.compliance.totalSubstances': '· {count} distinct substances',
  'defaults.compliance.missingWarning':
    'This substance has no DEFAULTS.md entry yet — saving will add it to the list.',

  // ── substance section: fields ──
  'defaults.field.substanceName': 'Substance name',
  'defaults.field.substanceNamePlaceholder': 'e.g. Modafinil',
  'defaults.field.amount': 'Amount',
  'defaults.field.amountHint': 'Optional. Applied on logging when not given explicitly.',
  'defaults.field.amountPlaceholder': 'e.g. 100 mg',
  'defaults.field.note': 'Note',
  'defaults.field.notePlaceholder': 'e.g. morning, before breakfast',

  // ── substance section: companion block ──
  // NOTE: "Mit:" stays untranslated — it is a parser token the server's
  // parseSections/buildMarkdownFromParsed rely on byte-for-byte.
  'defaults.companions.heading': 'Mit:',
  'defaults.companions.subheading': 'Companion substances logged automatically with this entry',
  'defaults.companions.fieldName': 'Companion name',
  'defaults.companions.fieldNamePlaceholder': 'Companion, e.g. Lemon balm',
  'defaults.companions.suggestionsAria': 'Show suggestions',
  'defaults.companions.suggestionsTitle': 'Suggestions',
  'defaults.companions.removeAria': 'Remove companion row',
  'defaults.companions.removeTitle': 'Remove companion row',
  'defaults.companions.addRow': 'Add companion row',
  'defaults.companions.nightBadge': 'Night',

  // ── substance section: pre/post disclosure ──
  'defaults.prePost.badge': 'AFTER/reservation',
  'defaults.prePost.summary': 'Lossless comment lines ({count})',
  'defaults.prePost.before': 'Before the fields',
  'defaults.prePost.after': 'After the fields',
  'defaults.prePost.hint':
    'These lines are shown in the raw editor under “Advanced” and are kept verbatim on save.',

  // ── raw view (Advanced tab) ──
  'defaults.raw.placeholder':
    '## Substance name\nAmount: …\nNote: …\nWith: … | … | …',
  'defaults.raw.parsedHeading': 'Currently parsed',
  'defaults.raw.parsedEmpty': 'No sections detected.',
  'defaults.raw.parsedWithAmount': ' · Amount {value}',
  'defaults.raw.parsedWithNote': ' · Note',
  'defaults.raw.parsedWithCompanions.one': ' · 1 companion',
  'defaults.raw.parsedWithCompanions.many': ' · {count} companions',
  'defaults.raw.helpText':
    'One ## Substance name heading per substance, with optional Amount:, Note: and With: lines underneath. Amount and Note are applied when logging if not given explicitly. With: name | amount | note logs the named companion as its own entry. Re-read on every entry.',

  // ── save bar ──
  'defaults.saveBar.discard': 'Discard',
  'defaults.saveBar.save': 'Save',

  // ── add-substance sheet ──
  'defaults.addSheet.title': 'New substance',
  'defaults.addSheet.subtitle': 'Will appear as a QuickPick tile',
  'defaults.addSheet.fieldName': 'Name',
  'defaults.addSheet.fieldNameHint': 'Shown when picking the substance during logging.',
  'defaults.addSheet.fieldNamePlaceholder': 'e.g. Modafinil',
  'defaults.addSheet.duplicate': 'A substance with this name already exists.',
  'defaults.addSheet.fieldDose': 'Default dose',
  'defaults.addSheet.fieldDoseHint': 'Optional',
  'defaults.addSheet.fieldDosePlaceholder': 'e.g. 100',
  'defaults.addSheet.fieldUnit': 'Unit',
  'defaults.addSheet.fieldUnitHint': 'Optional',
  'defaults.addSheet.fieldUnitPlaceholder': 'e.g. mg',
  'defaults.addSheet.cancel': 'Cancel',
  'defaults.addSheet.create': 'Create',

  // ── tab-switch confirm ──
  'defaults.confirm.discardRawChanges':
    'You have unsaved changes in the raw editor. Switching back will discard them. Continue?',

  // ── toasts ──
  'defaults.toast.saved': 'Standard notes saved',
  'defaults.toast.saveFailed': 'Save failed',
  'defaults.toast.substanceCreated': 'Substance created',
  'defaults.toast.substanceCreateFailed': 'Could not create substance',
} as const;