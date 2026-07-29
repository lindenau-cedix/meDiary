/**
 * German strings for the DEFAULTS.md editor screen (`/standardnotizen`).
 *
 * Key prefix: `defaults.*`. The editor round-trips a Markdown file —
 * substance names, amounts, note text and the `Mit:` companion keyword are
 * DATA and are never translated. Only the UI chrome around them
 * (field labels, buttons, hints, placeholders, badges) lives here.
 */
export const defaults = {
  // ── screen header ──
  'defaults.back': 'Zurück zu Einstellungen',
  'defaults.title': 'Standard-Notizen',
  'defaults.eyebrow': 'Wird automatisch als Notiz/Menge übernommen',

  // ── tab switcher ──
  'defaults.tab.structured': 'Strukturiert',
  'defaults.tab.raw': 'Erweitert (Markdown)',

  // ── structured view: empty state ──
  'defaults.empty.title': 'Noch keine Substanzen in DEFAULTS.md.',
  'defaults.empty.addBlank': 'Leere Sektion anlegen',
  'defaults.empty.addWithTile': 'Substanz mit Kachel anlegen',

  // ── structured view: actions ──
  'defaults.action.addSection': 'Neue Sektion',
  'defaults.action.addWithTile': '+ Substanz mit Kachel',
  'defaults.action.deleteAria': 'Sektion löschen',
  'defaults.action.deleteTitle': 'Sektion löschen',

  // ── structured view: confirm dialog ──
  'defaults.confirm.removeSection': 'Sektion "{name}" wirklich entfernen?',

  // ── structured view: prefill chip ──
  'defaults.prefill.title': 'Neue Sektion: {name}',
  'defaults.prefill.detail': 'Wurde soeben aus dem Compliance-Bericht nachgepflegt — bitte Menge/Notiz ergänzen.',
  'defaults.prefill.create': 'Anlegen',
  'defaults.prefill.discard': 'Verwerfen',

  // ── structured view: compliance suggestion ──
  'defaults.compliance.eyebrow': 'Vorgeschlagen aus Compliance',
  'defaults.compliance.suggestionCount': '({count}×)',
  'defaults.compliance.summaryLoading': 'Compliance-Bericht wird geladen …',
  'defaults.compliance.withEntry': '{count} mit Eintrag',
  'defaults.compliance.withoutEntry': '{count} ohne Eintrag',
  'defaults.compliance.fullyCovered': 'Alles abgedeckt',
  'defaults.compliance.totalSubstances': '· {count} unterschiedliche Substanzen',
  'defaults.compliance.missingWarning':
    'Diese Substanz hat aktuell keinen Eintrag in DEFAULTS.md — beim Speichern wird die Liste ergänzt.',

  // ── substance section: fields ──
  'defaults.field.substanceName': 'Substanzname',
  'defaults.field.substanceNamePlaceholder': 'z. B. Modafinil',
  'defaults.field.amount': 'Menge',
  'defaults.field.amountHint': 'Optional. Wird beim Eintragen übernommen, wenn nicht selbst angegeben.',
  'defaults.field.amountPlaceholder': 'z. B. 100 mg',
  'defaults.field.note': 'Notiz',
  'defaults.field.notePlaceholder': 'z. B. morgens, vor dem Frühstück',

  // ── substance section: companion block ──
  // NOTE: "Mit:" itself stays German — it is a parser token the server's
  // parseSections/buildMarkdownFromParsed rely on byte-for-byte.
  'defaults.companions.heading': 'Mit:',
  'defaults.companions.subheading': 'Begleitstoffe, die automatisch miterfasst werden',
  'defaults.companions.fieldName': 'Mit-Name',
  'defaults.companions.fieldNamePlaceholder': 'Begleitstoff, z. B. Lemon Balm',
  'defaults.companions.suggestionsAria': 'Vorschläge anzeigen',
  'defaults.companions.suggestionsTitle': 'Vorschläge',
  'defaults.companions.removeAria': 'Mit-Zeile entfernen',
  'defaults.companions.removeTitle': 'Mit-Zeile entfernen',
  'defaults.companions.addRow': 'Mit-Zeile hinzufügen',
  'defaults.companions.nightBadge': 'Nacht',

  // ── substance section: pre/post disclosure ──
  'defaults.prePost.badge': 'NACH-/Vorbehalt',
  'defaults.prePost.summary': 'Verlustfreie Kommentarzeilen ({count})',
  'defaults.prePost.before': 'Vor den Feldern',
  'defaults.prePost.after': 'Nach den Feldern',
  'defaults.prePost.hint':
    'Diese Zeilen werden im Raw-Editor unter „Erweitert" angezeigt und beim Speichern 1:1 übernommen.',

  // ── raw view (Erweitert tab) ──
  'defaults.raw.placeholder':
    '## Substanzname\nMenge: …\nNotiz: …\nMit: … | … | …',
  'defaults.raw.parsedHeading': 'Aktuell geparst',
  'defaults.raw.parsedEmpty': 'Keine Sektionen erkannt.',
  'defaults.raw.parsedWithAmount': ' · Menge {value}',
  'defaults.raw.parsedWithNote': ' · Notiz',
  'defaults.raw.parsedWithCompanions.one': ' · 1 Mit:',
  'defaults.raw.parsedWithCompanions.many': ' · {count} Mit:',
  'defaults.raw.helpText':
    'Pro Substanz eine ## Substanzname-Überschrift, darunter optional Menge:, Notiz: und Mit:. Menge/Notiz werden beim Eintragen übernommen, wenn sie nicht selbst angegeben wurden. Mit: Name | Menge | Notiz trägt die genannte Begleitsubstanz automatisch als eigene Einnahme mit ein. Wird bei jedem Eintrag frisch gelesen.',

  // ── save bar ──
  'defaults.saveBar.discard': 'Verwerfen',
  'defaults.saveBar.save': 'Speichern',

  // ── add-substance sheet ──
  'defaults.addSheet.title': 'Neue Substanz',
  'defaults.addSheet.subtitle': 'Wird als QuickPick-Kachel verfügbar',
  'defaults.addSheet.fieldName': 'Name',
  'defaults.addSheet.fieldNameHint': 'Wird zum Tippen in der Einnahme-Auswahl angezeigt.',
  'defaults.addSheet.fieldNamePlaceholder': 'z. B. Modafinil',
  'defaults.addSheet.duplicate': 'Eine Substanz mit diesem Namen existiert bereits.',
  'defaults.addSheet.fieldDose': 'Standard-Dosis',
  'defaults.addSheet.fieldDoseHint': 'Optional',
  'defaults.addSheet.fieldDosePlaceholder': 'z. B. 100',
  'defaults.addSheet.fieldUnit': 'Einheit',
  'defaults.addSheet.fieldUnitHint': 'Optional',
  'defaults.addSheet.fieldUnitPlaceholder': 'z. B. mg',
  'defaults.addSheet.cancel': 'Abbrechen',
  'defaults.addSheet.create': 'Anlegen',

  // ── tab-switch confirm ──
  'defaults.confirm.discardRawChanges':
    'Im Raw-Editor wurden Änderungen gemacht. Beim Zurückwechseln gehen diese Änderungen verloren. Fortfahren?',

  // ── toasts ──
  'defaults.toast.saved': 'Standard-Notizen gespeichert',
  'defaults.toast.saveFailed': 'Speichern fehlgeschlagen',
  'defaults.toast.substanceCreated': 'Substanz angelegt',
  'defaults.toast.substanceCreateFailed': 'Substanz konnte nicht angelegt werden',
} as const;