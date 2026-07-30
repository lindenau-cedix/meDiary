/**
 * English counterpart of `../de/metrics.ts`.
 *
 * Short labels are kept genuinely short — they render as chart axis ticks and
 * pill labels where the German originals were abbreviated too.
 */
export const metrics = {
  // ── scale labels (long / short) ──
  'metric.sleep_quality': 'Sleep quality',
  'metric.sleep_quality.short': 'Sleep',
  'metric.fatigue': 'Fatigue / exhaustion',
  'metric.fatigue.short': 'Fatigue',
  'metric.stability': 'Stability',
  'metric.stability.short': 'Stability',
  'metric.psychotic_load': 'Psychotic / detached from reality',
  'metric.psychotic_load.short': 'Psychosis',
  'metric.mood': 'Mood',
  'metric.mood.short': 'Mood',
  'metric.functioning': 'Everyday functioning',
  'metric.functioning.short': 'Function',
  'metric.anxiety': 'Anxiety / inner tension',
  'metric.anxiety.short': 'Anxiety',
  'metric.craving': 'Craving / urge to use',
  'metric.craving.short': 'Craving',
  'metric.overstimulation': 'Overstimulation / restlessness',
  'metric.overstimulation.short': 'Overstim.',
  'metric.sedation': 'Sedation / grogginess',
  'metric.sedation.short': 'Sedation',
  'metric.pain': 'Pain / physical discomfort',
  'metric.pain.short': 'Pain',

  // ── scale anchors ──
  'anchor.veryBad': 'very poor',
  'anchor.restful': 'restful',
  'anchor.notAtAll': 'not at all',
  'anchor.extreme': 'extreme',
  'anchor.unstable': 'unstable',
  'anchor.stable': 'stable',
  'anchor.low': 'low',
  'anchor.good': 'good',
  'anchor.barely': 'barely',
  'anchor.full': 'fully',

  // ── plan dayparts ──
  'daypart.morning': 'Morning',
  'daypart.morning.short': 'M',
  'daypart.noon': 'Midday',
  'daypart.noon.short': 'Mi',
  'daypart.evening': 'Evening',
  'daypart.evening.short': 'E',
  'daypart.night': 'Night',
  'daypart.night.short': 'N',

  // ── plan field labels ──
  'planField.strength': 'Strength',
  'planField.unit': 'Unit',
  'planField.reason': 'Reason',
  'planField.notes': 'Note',
} as const;
