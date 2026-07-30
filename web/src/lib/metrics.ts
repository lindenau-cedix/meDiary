import type { Metric } from './types';
import { translate, type MessageKey } from './i18n';

/**
 * Local copy of the 11 assessment dimensions (fallback, and available
 * instantly — also offline). Structurally identical to the server definition;
 * the server stays authoritative and can be loaded via /api/metrics.
 *
 * Only the *display* strings are translated. `key` and `polarity` are part of
 * the data contract (they address DB columns and drive the colour scale), so
 * they stay hardcoded and locale-independent.
 */
const METRIC_DEFS: {
  key: string;
  polarity: Metric['polarity'];
  low: MessageKey;
  high: MessageKey;
}[] = [
  { key: 'sleep_quality', polarity: 'positive', low: 'anchor.veryBad', high: 'anchor.restful' },
  { key: 'fatigue', polarity: 'negative', low: 'anchor.notAtAll', high: 'anchor.extreme' },
  { key: 'stability', polarity: 'positive', low: 'anchor.unstable', high: 'anchor.stable' },
  { key: 'psychotic_load', polarity: 'negative', low: 'anchor.notAtAll', high: 'anchor.extreme' },
  { key: 'mood', polarity: 'positive', low: 'anchor.low', high: 'anchor.good' },
  { key: 'functioning', polarity: 'positive', low: 'anchor.barely', high: 'anchor.full' },
  { key: 'anxiety', polarity: 'negative', low: 'anchor.notAtAll', high: 'anchor.extreme' },
  { key: 'craving', polarity: 'negative', low: 'anchor.notAtAll', high: 'anchor.extreme' },
  { key: 'overstimulation', polarity: 'negative', low: 'anchor.notAtAll', high: 'anchor.extreme' },
  { key: 'sedation', polarity: 'negative', low: 'anchor.notAtAll', high: 'anchor.extreme' },
  { key: 'pain', polarity: 'negative', low: 'anchor.notAtAll', high: 'anchor.extreme' },
];

/** Metric keys in canonical order — locale-independent, safe as a constant. */
export const METRIC_KEYS = METRIC_DEFS.map((m) => m.key);

/**
 * The 11 metrics with labels in the active locale.
 *
 * A function rather than a `const` array, because the labels depend on the
 * current locale: components call it during render, so a language switch
 * re-renders them with fresh strings. (Was previously the exported constant
 * `METRICS`.)
 */
export function metricList(): Metric[] {
  return METRIC_DEFS.map((m) => ({
    key: m.key,
    label: translate(`metric.${m.key}` as MessageKey),
    short: translate(`metric.${m.key}.short` as MessageKey),
    polarity: m.polarity,
    lowLabel: translate(m.low),
    highLabel: translate(m.high),
  }));
}

/** Translated long label for a metric key, falling back to the raw key. */
export function metricLabel(key: string): string {
  return METRIC_KEYS.includes(key) ? translate(`metric.${key}` as MessageKey) : key;
}

/** Translated short label (chart axes, pills), falling back to the raw key. */
export function metricShort(key: string): string {
  return METRIC_KEYS.includes(key) ? translate(`metric.${key}.short` as MessageKey) : key;
}
