/**
 * The 11 assessment scales plus their low/high anchors, and the plan dayparts.
 *
 * These live in their own namespace because two places consume them: the
 * assessment sheet (full labels) and the charts/trends screens (short labels
 * that must fit an axis tick). The metric *keys* are server-owned and stay
 * unchanged — only the display strings are translated.
 */
export const metrics = {
  // ── scale labels (long / short) ──
  'metric.sleep_quality': 'Schlafqualität',
  'metric.sleep_quality.short': 'Schlaf',
  'metric.fatigue': 'Müdigkeit / Erschöpfung',
  'metric.fatigue.short': 'Müdigkeit',
  'metric.stability': 'Stabilität',
  'metric.stability.short': 'Stabilität',
  'metric.psychotic_load': 'Psychotisch / Realitätsferne',
  'metric.psychotic_load.short': 'Psychose',
  'metric.mood': 'Stimmung',
  'metric.mood.short': 'Stimmung',
  'metric.functioning': 'Leistung / Funktion im Alltag',
  'metric.functioning.short': 'Funktion',
  'metric.anxiety': 'Angst / innere Anspannung',
  'metric.anxiety.short': 'Angst',
  'metric.craving': 'Craving / Suchtdruck',
  'metric.craving.short': 'Craving',
  'metric.overstimulation': 'Überstimulation / Getriebenheit',
  'metric.overstimulation.short': 'Überstim.',
  'metric.sedation': 'Sedierung / Benommenheit',
  'metric.sedation.short': 'Sedierung',
  'metric.pain': 'Schmerz / körperliche Beschwerden',
  'metric.pain.short': 'Schmerz',

  // ── scale anchors ──
  'anchor.veryBad': 'sehr schlecht',
  'anchor.restful': 'erholsam',
  'anchor.notAtAll': 'gar nicht',
  'anchor.extreme': 'extrem',
  'anchor.unstable': 'labil',
  'anchor.stable': 'stabil',
  'anchor.low': 'gedrückt',
  'anchor.good': 'gut',
  'anchor.barely': 'kaum',
  'anchor.full': 'voll',

  // ── plan dayparts ──
  'daypart.morning': 'Morgens',
  'daypart.morning.short': 'M',
  'daypart.noon': 'Mittags',
  'daypart.noon.short': 'Mi',
  'daypart.evening': 'Abends',
  'daypart.evening.short': 'A',
  'daypart.night': 'Nachts',
  'daypart.night.short': 'N',

  // ── plan field labels ──
  'planField.strength': 'Stärke',
  'planField.unit': 'Einheit',
  'planField.reason': 'Grund',
  'planField.notes': 'Hinweis',
} as const;
