/**
 * German strings for the Plan screen.
 *
 * Plan versioning wording ("gültig ab", diff/compare wording, "Einträge"
 * counts), the snapshot sheet, and the editor form. Counts that differ
 * singular/plural use two keys per the i18n contract.
 */
export const plan = {
  // ── page header ──
  'plan.eyebrow.noPlan': 'Medikationsplan',
  'plan.eyebrow.effectiveToday': 'heute',
  'plan.eyebrow.effectiveTodayAt': 'heute, {time} Uhr',
  'plan.eyebrow.effectiveSince': 'Gültig seit {date}',

  // ── upcoming change card ──
  'plan.upcoming.title': 'Geplante Änderung',
  'plan.upcoming.row': 'Ab {date} ({relative})',
  'plan.upcoming.withNote': 'Ab {date} ({relative}): {note}',
  'plan.upcoming.itemCount.one': '{count} Eintrag',
  'plan.upcoming.itemCount.many': '{count} Einträge',

  // ── empty state ──
  'plan.empty.title': 'Noch kein Plan',
  'plan.empty.description':
    'Lege deinen Medikationsplan an. Jede Änderung wird als Version mit Datum festgehalten.',
  'plan.empty.action': 'Plan anlegen',

  // ── last change footer ──
  'plan.lastChange': 'Letzte Änderung: {note}',

  // ── compare section ──
  'plan.compare.heading': 'Was war anders?',
  'plan.compare.range.one': '{count} Tag',
  'plan.compare.range.many': '{count} Tage',
  'plan.compare.loading': 'Vergleiche …',
  'plan.compare.unchanged': 'Unverändert gegenüber {date}.',
  'plan.compare.unchangedFallback': 'Unverändert gegenüber vor {days} Tagen.',
  'plan.compare.header': 'Vergleich mit {date}',
  'plan.compare.headerFallback': 'Vergleich mit vor {days} Tagen',
  'plan.diff.added': 'neu hinzugefügt',
  'plan.diff.removed': 'abgesetzt',

  // ── version history ──
  'plan.versions.heading': 'Verlauf der Versionen',
  'plan.versions.noteFallbackActive': 'Aktuelle Version',
  'plan.versions.noteFallbackOther': 'Plananpassung',
  'plan.versions.summary': 'gültig ab {date} · {count} · {relative}',
  'plan.versions.summaryCount.one': '{count} Eintrag',
  'plan.versions.summaryCount.many': '{count} Einträge',
  'plan.versions.badge.active': 'aktuell',
  'plan.versions.badge.upcoming': 'geplant',

  // ── snapshot sheet ──
  'plan.snapshot.titleFallback': 'Planversion',
  'plan.snapshot.subtitle': 'Gültig ab {date}, {time} Uhr',
  'plan.snapshot.subtitleDateOnly': 'Gültig ab {date}',
  'plan.snapshot.loading': 'Lädt …',

  // ── editor sheet ──
  'plan.editor.title': 'Plan bearbeiten',
  'plan.editor.subtitle': 'Neue Version — rückwirkend, ab heute oder mit Datum in der Zukunft',
  'plan.editor.addRow': 'Zeile',
  'plan.editor.row.remove': 'Zeile entfernen',
  'plan.editor.placeholder.substance': 'Substanz',
  'plan.editor.placeholder.strength': 'Stärke',
  'plan.editor.placeholder.slot': '0',
  'plan.editor.placeholder.reason': 'Grund (optional)',
  'plan.editor.placeholder.notes': 'Hinweis (optional)',
  'plan.editor.field.effectiveFrom': 'Gültig ab',
  'plan.editor.field.effectiveAt': 'Uhrzeit (optional)',
  'plan.editor.hint.timeOptional': 'Uhrzeit optional — ohne Angabe gilt der Plan ab Tagesbeginn.',
  'plan.editor.field.changeNote': 'Änderungsnotiz',
  'plan.editor.placeholder.changeNote': 'z. B. Quetiapin von 100 auf 150 mg erhöht',

  // ── effective-date hint ──
  'plan.editor.hint.past': 'Rückwirkend — gilt bereits seit {date} ({relative}).',
  'plan.editor.hint.future': 'Geplant — wird erst {relative}{atTime} wirksam; bis dahin bleibt der bisherige Plan aktuell.',
  'plan.editor.hint.futureAtTime': ' um {time} Uhr',
  'plan.editor.hint.todayAtTime': 'Gilt ab heute, {time} Uhr.',
  'plan.editor.hint.today': 'Gilt ab heute.',

  // ── save toast ──
  'plan.save.toast': 'Plan gespeichert',
  'plan.save.toastDetail': '{count} Einträge · gültig ab {effective}',
  'plan.save.toastCount.one': '{count} Eintrag',
  'plan.save.toastCount.many': '{count} Einträge',
  'plan.save.toastEffectiveToday': 'heute',
} as const;