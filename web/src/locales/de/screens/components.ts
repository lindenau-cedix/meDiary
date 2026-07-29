/**
 * Shared component-level strings (nav, sheets, toast actions, drawers,
 * generic UI bits). One prefix (`components.*`) per file.
 *
 * Reuse generic keys from `common.ts` (`action.close`, `action.retry`,
 * `state.loading`, `date.today`, `error.*`, …) where they fit.
 */
export const components = {
  // ── bottom navigation ──
  // Nav labels reuse the existing `nav.*` keys from the common catalog.

  // ── AppShell / PageHeader ──
  // These components take raw ReactNode props; no user-visible strings.

  // ── TrendChart empty state ──
  'components.trendChart.empty': 'keine Daten',

  // ── SentDreamsLog (dream delivery log) ──
  'components.sentDreams.title': 'Gesendete Träume',
  'components.sentDreams.subtitle':
    'Jede Nacht träumt die App und schickt den Traum direkt auf WhatsApp — hier siehst du das Zustell-Protokoll.',
  'components.sentDreams.loadError': 'Der Zustell-Verlauf konnte nicht geladen werden.',
  'components.sentDreams.empty':
    'Noch keine gesendeten Träume. Die App träumt heute Nacht um 04:20 Uhr und schickt den Traum direkt auf WhatsApp.',
  'components.sentDreams.voiceFailed': 'Sprachnachricht fehlgeschlagen',
  'components.sentDreams.retry': 'Erneut senden',
  'components.sentDreams.resent': 'Erneut gesendet',
  'components.sentDreams.resendFailed': 'Erneut senden fehlgeschlagen',

  // status pills (kept short) — also used by SentDreamDrawer
  'components.delivery.status.sent': 'Gesendet',
  'components.delivery.status.failed': 'Fehlgeschlagen',
  'components.delivery.status.abandoned': 'Abgebrochen',
  'components.delivery.status.pending': 'Ausstehend',

  // ── SentDreamDrawer (slide-in dream detail) ──
  'components.sentDreamDrawer.aria': 'Traum {date}',
  'components.sentDreamDrawer.noDream': 'Kein Traum gespeichert.',
  'components.sentDreamDrawer.meta.delivery': 'Zustellung',
  'components.sentDreamDrawer.meta.channel': 'Kanal',
  'components.sentDreamDrawer.meta.channelFallback': 'WhatsApp',
  'components.sentDreamDrawer.meta.recipient': 'Empfänger',
  'components.sentDreamDrawer.meta.attempts': 'Versuche',
  'components.sentDreamDrawer.meta.voice': 'Sprachnachricht',
  'components.sentDreamDrawer.voice.failed': 'fehlgeschlagen',
  'components.sentDreamDrawer.voice.sent': 'gesendet',
  'components.sentDreamDrawer.meta.sentAt': 'Gesendet',

  // ── AssessmentSheet (daily scales) ──
  'components.assessmentSheet.title': 'Tagesbild',
  'components.assessmentSheet.subtitle': '{date} · {when}',
  'components.assessmentSheet.subtitleToday': '{date} · {today}',
  'components.assessmentSheet.counter': '{filled}/{total} erfasst',
  'components.assessmentSheet.counterLabel': 'erfasst',
  'components.assessmentSheet.later': 'Später',
  'components.assessmentSheet.savedToast': 'Tagesbild gespeichert',
  'components.assessmentSheet.savedDetail': '{date} · {filled}/{total} Werte',
  'components.assessmentSheet.failedToast': 'Speichern fehlgeschlagen',
  'components.assessmentSheet.promptToday':
    'Die Nachtmedikation ist erfasst. Wie war der heutige Tag? Skala 1–10.',
  'components.assessmentSheet.promptPast': 'Werte für {when} nachtragen oder anpassen. Skala 1–10.',
  'components.assessmentSheet.promptFuture': 'Werte für den kommenden Konsum-Tag voraus-planen. Skala 1–10.',
  'components.assessmentSheet.carriedHint':
    'Werte vom letzten Eintrag übernommen — passe nur an, was sich verändert hat.',
  'components.assessmentSheet.notePlaceholder':
    'Notiz zum Tag (optional) — Auffälligkeiten, Auslöser, Kontext …',
} as const;
