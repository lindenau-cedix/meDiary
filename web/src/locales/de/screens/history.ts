/**
 * German strings for the History ("Verlauf") screen.
 *
 * Keys are merged flat via `web/src/locales/de/index.ts`; the English mirror
 * lives next door (`en/screens/history.ts`) and is type-checked against this
 * shape, so any key added here must be added there too.
 */
export const history = {
  // Page header
  'history.title': 'Verlauf',
  'history.count': '{count} Einnahmen erfasst',
  'history.count.one': 'eine Einnahme erfasst',
  'history.count.many': '{count} Einnahmen erfasst',

  // Filter chips
  'history.filterAll': 'Alle',

  // Empty state
  'history.empty.title': 'Noch nichts erfasst',
  'history.empty.description': 'Erfasste Einnahmen erscheinen hier — chronologisch nach Tagen gruppiert.',

  // Day grouping
  'history.entries': '{count} Einträge',
  'history.entries.one': 'ein Eintrag',
  'history.entries.many': '{count} Einträge',

  // Plan-match badge
  'history.planBadge': 'Plan',
  'history.planMatchTitle': 'Substanz und Dosis stimmen mit dem aktuellen Medikationsplan überein',

  // Edit sheet
  'history.field.time': 'Zeitpunkt',
  'history.field.amount': 'Menge',
  'history.field.amountPlaceholder': 'z. B. 150 mg',
  'history.field.note': 'Notiz',
  'history.field.notePlaceholder': 'Notiz …',

  // Toast messages
  'history.updated': 'Aktualisiert',
  'history.deleted': 'Gelöscht',
} as const;