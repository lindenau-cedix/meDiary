/**
 * English counterpart of `./components.ts`. Key coverage is enforced by the
 * `Messages` annotation in `../index.ts` — a missing key is a compile error,
 * not a silent German fallback.
 */
export const components = {
  // ── bottom navigation ──
  // Nav labels reuse the existing `nav.*` keys from the common catalog.

  // ── AppShell / PageHeader ──
  // These components take raw ReactNode props; no user-visible strings.

  // ── TrendChart empty state ──
  'components.trendChart.empty': 'no data',

  // ── SentDreamsLog (dream delivery log) ──
  'components.sentDreams.title': 'Sent dreams',
  'components.sentDreams.subtitle':
    'Each night the app dreams and delivers the dream straight to WhatsApp — this is the delivery log.',
  'components.sentDreams.loadError': 'The delivery log could not be loaded.',
  'components.sentDreams.empty':
    'No dreams sent yet. Tonight at 04:20 the app will dream and send the dream straight to WhatsApp.',
  'components.sentDreams.voiceFailed': 'Voice note failed',
  'components.sentDreams.retry': 'Resend',
  'components.sentDreams.resent': 'Resent',
  'components.sentDreams.resendFailed': 'Resend failed',

  // status pills (kept short) — also used by SentDreamDrawer
  'components.delivery.status.sent': 'Sent',
  'components.delivery.status.failed': 'Failed',
  'components.delivery.status.abandoned': 'Abandoned',
  'components.delivery.status.pending': 'Pending',

  // ── SentDreamDrawer (slide-in dream detail) ──
  'components.sentDreamDrawer.aria': 'Dream {date}',
  'components.sentDreamDrawer.noDream': 'No dream saved.',
  'components.sentDreamDrawer.meta.delivery': 'Delivery',
  'components.sentDreamDrawer.meta.channel': 'Channel',
  'components.sentDreamDrawer.meta.channelFallback': 'WhatsApp',
  'components.sentDreamDrawer.meta.recipient': 'Recipient',
  'components.sentDreamDrawer.meta.attempts': 'Attempts',
  'components.sentDreamDrawer.meta.voice': 'Voice note',
  'components.sentDreamDrawer.voice.failed': 'failed',
  'components.sentDreamDrawer.voice.sent': 'sent',
  'components.sentDreamDrawer.meta.sentAt': 'Sent',

  // ── AssessmentSheet (daily scales) ──
  'components.assessmentSheet.title': 'Daily assessment',
  'components.assessmentSheet.subtitle': '{date} · {when}',
  'components.assessmentSheet.subtitleToday': '{date} · {today}',
  'components.assessmentSheet.counter': '{filled}/{total} recorded',
  'components.assessmentSheet.counterLabel': 'recorded',
  'components.assessmentSheet.later': 'Later',
  'components.assessmentSheet.savedToast': 'Daily assessment saved',
  'components.assessmentSheet.savedDetail': '{date} · {filled}/{total} values',
  'components.assessmentSheet.failedToast': 'Save failed',
  'components.assessmentSheet.promptToday':
    'Night medication is logged. How was today? Scale 1–10.',
  'components.assessmentSheet.promptPast': 'Add or adjust values for {when}. Scale 1–10.',
  'components.assessmentSheet.promptFuture': 'Plan values for the upcoming consumption day. Scale 1–10.',
  'components.assessmentSheet.carriedHint':
    'Values carried over from the last entry — only adjust what changed.',
  'components.assessmentSheet.notePlaceholder':
    'Note for the day (optional) — observations, triggers, context …',
} as const;
