/**
 * German strings for the "Heute" / Quick-Entry screen.
 *
 * One prefix (`quickEntry.*`) per file. Reuses generic keys from `common.ts`
 * (`action.now` / `action.open` / `action.undo` / `action.add`) where they fit
 * so we don't redefine them here.
 */
export const quickEntry = {
  // ── page header & navigation ──
  'quickEntry.title': 'Heute',
  'quickEntry.consoleLabel': 'Daten-Konsole',
  'quickEntry.settingsLabel': 'Einstellungen',

  // ── offline banner ──
  'quickEntry.offlineTitle': 'Server nicht erreichbar',
  'quickEntry.offlineDetail': 'Adresse in den Einstellungen prüfen.',

  // ── DEFAULTS-compliance warning ──
  'quickEntry.missingDefaults.one': '1 Substanz ohne DEFAULTS-Eintrag',
  'quickEntry.missingDefaults.many': '{count} Substanzen ohne DEFAULTS-Eintrag',
  'quickEntry.missingDefaultsDetail':
    'Diese Stoffe bekommen beim Eintragen aktuell keine Standard-Notiz/-Menge. In den Einstellungen unter „Standard-Notizen" ergänzen.',
  'quickEntry.maintain': 'Pflegen',

  // ── composer (shared timestamp + per-substance row) ──
  'quickEntry.composerHint':
    'Substanz(en) unten antippen — Menge & Notiz erscheinen dann hier, der Zeitpunkt gilt für alle.',
  'quickEntry.composerHintLongPress':
    'Lange drücken trägt eine Substanz sofort mit Standardwerten ein.',
  'quickEntry.amountLabel': 'Menge',
  'quickEntry.amountAria': 'Menge {name}',
  'quickEntry.noteLabel': 'Notiz',
  'quickEntry.noteWithDefault': 'Notiz (Standard hinterlegt)',
  'quickEntry.noteAria': 'Notiz {name}',
  'quickEntry.removeSubstanceAria': '{name} entfernen',
  'quickEntry.defaultLabel': 'Standard:',
  'quickEntry.alsoAdded': 'Automatisch dazu:',

  // ── sort & manage header ──
  'quickEntry.sortHeader': 'Substanzen wählen',
  'quickEntry.sortHeaderActive': 'Reihenfolge ziehen',
  'quickEntry.done': 'Fertig',
  'quickEntry.sort': 'Sortieren',
  'quickEntry.manage': 'Verwalten',
  'quickEntry.sortManual': 'Manuell',
  'quickEntry.sortFrequency': 'Häufigkeit',
  'quickEntry.sortModeHint':
    'Am Griff ziehen, um die Reihenfolge zu ändern — sie wird automatisch gespeichert.',
  'quickEntry.dragHandleAria': 'Zum Sortieren ziehen',

  // ── plan-batch tiles (collective entries) ──
  'quickEntry.planBatch.morning': 'Morgendmedis',
  'quickEntry.planBatch.noon': 'Mittagsmedis',
  'quickEntry.planBatch.evening': 'Abendmedis',
  'quickEntry.planBatch.night': 'Nachtmedis',
  'quickEntry.planBatch.entryCount.one': '1 Eintrag',
  'quickEntry.planBatch.entryCount.many': '{count} Einträge',
  'quickEntry.planBatch.tileTitle': 'Alle {count} Plan-Einträge auf einmal erfassen',

  // ── substance tile (grid) ──
  'quickEntry.addSubstance': 'Substanz',
  'quickEntry.missingDefaultTooltip': 'Kein DEFAULTS-Eintrag – in Einstellungen ergänzen',
  'quickEntry.missingDefaultAria': 'Kein DEFAULTS-Eintrag',
  'quickEntry.inPlanTooltip': 'Teil des aktuellen Medikationsplans',
  'quickEntry.frequencyTooltip': '{count}× erfasst in den letzten 90 Tagen',
  'quickEntry.frequencyShort': '{count}× letzte 90 T.',

  // ── empty state ──
  'quickEntry.emptyHint':
    'Lege deine erste Substanz an, um mit einem Tipp Einnahmen zu erfassen.',

  // ── "Heute erfasst" list ──
  'quickEntry.loggedToday': 'Heute erfasst',
  'quickEntry.showAll': 'alle',
  'quickEntry.planBadgeTitle':
    'Substanz und Dosis stimmen mit dem aktuellen Medikationsplan überein',
  'quickEntry.planBadgeLabel': 'Plan',

  // ── floating confirm bar (collective selection) ──
  'quickEntry.selectedCount.many': '{count} Substanzen',
  'quickEntry.takenAtTime': '{time} Uhr',
  'quickEntry.discardSelectionAria': 'Auswahl verwerfen',
  'quickEntry.record': 'Eintragen',

  // ── toasts ──
  'quickEntry.toast.saved': '{name} eingetragen',
  'quickEntry.toast.savedCount': '{count} Einträge erfasst',
  'quickEntry.toast.batchSaved': '{label} eingetragen',
  'quickEntry.toast.batchEmpty': '{label}: nichts eingetragen',
  'quickEntry.toast.batchEmptyDetail':
    'Für diesen Slot ist im aktuellen Plan nichts hinterlegt.',
  'quickEntry.toast.failed': 'Eintrag fehlgeschlagen',
} as const;
