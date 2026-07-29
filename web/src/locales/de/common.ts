/**
 * Shared German strings: navigation, generic actions, date/greeting wording,
 * the 11 assessment scales, plan dayparts and API error fallbacks.
 *
 * German is the catalog of record — every key is defined here first, and the
 * English counterpart is typed against it (see `../en/common.ts`), so a
 * forgotten translation fails the type check instead of shipping silently.
 *
 * Keys are fully qualified and dotted; namespaces are merged flat in
 * `../de/index.ts`.
 */
export const common = {
  // ── navigation ──
  'nav.today': 'Heute',
  'nav.history': 'Verlauf',
  'nav.dreams': 'Träume',
  'nav.plan': 'Plan',
  'nav.values': 'Werte',
  'nav.stats': 'Statistik',

  // ── generic actions ──
  'action.save': 'Speichern',
  'action.saving': 'Speichern…',
  'action.cancel': 'Abbrechen',
  'action.delete': 'Löschen',
  'action.undo': 'Rückgängig',
  'action.close': 'Schließen',
  'action.open': 'Öffnen',
  'action.edit': 'Bearbeiten',
  'action.add': 'Hinzufügen',
  'action.retry': 'Erneut versuchen',
  'action.refresh': 'Aktualisieren',
  'action.back': 'Zurück',
  'action.more': 'Weiterlesen',
  'action.less': 'Weniger',
  'action.now': 'Jetzt',
  'action.today': 'Heute',
  'action.confirm': 'Bestätigen',

  // ── generic state ──
  'state.loading': 'Laden…',
  'state.empty': 'Nichts vorhanden',
  'state.none': '—',
  'state.optional': 'optional',

  // ── relative dates ──
  'date.today': 'Heute',
  'date.yesterday': 'Gestern',
  'date.tomorrow': 'Morgen',
  'date.todayLower': 'heute',
  'date.yesterdayLower': 'gestern',
  'date.tomorrowLower': 'morgen',
  'date.daysAgo': 'vor {count} Tagen',
  'date.inDays': 'in {count} Tagen',
  'date.atTime': '{date}, {time} Uhr',

  // ── greetings ──
  'greeting.night': 'Gute Nacht',
  'greeting.morning': 'Guten Morgen',
  'greeting.day': 'Guten Tag',
  'greeting.evening': 'Guten Abend',

  // ── API errors ──
  'error.generic': 'Fehler {status}',
  'error.unreachable': 'Server nicht erreichbar. Verbindung & Server-Adresse prüfen.',
} as const;
