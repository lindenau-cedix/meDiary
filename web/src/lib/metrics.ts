import type { Metric } from './types';

/**
 * Lokale Kopie der 11 Assessment-Dimensionen (Fallback & sofort verfügbar,
 * auch offline). Identisch zur Server-Definition; der Server bleibt die
 * maßgebliche Quelle und kann via /api/metrics nachgeladen werden.
 */
export const METRICS: Metric[] = [
  { key: 'sleep_quality', label: 'Schlafqualität', short: 'Schlaf', polarity: 'positive', lowLabel: 'sehr schlecht', highLabel: 'erholsam' },
  { key: 'fatigue', label: 'Müdigkeit / Erschöpfung', short: 'Müdigkeit', polarity: 'negative', lowLabel: 'wach', highLabel: 'erschöpft' },
  { key: 'stability', label: 'Stabilität', short: 'Stabilität', polarity: 'positive', lowLabel: 'labil', highLabel: 'stabil' },
  { key: 'psychotic_load', label: 'Psychotische Symptomlast', short: 'Psychose', polarity: 'negative', lowLabel: 'keine', highLabel: 'stark' },
  { key: 'functioning', label: 'Leistung / Funktion', short: 'Funktion', polarity: 'positive', lowLabel: 'kaum', highLabel: 'voll' },
  { key: 'mood', label: 'Stimmung', short: 'Stimmung', polarity: 'positive', lowLabel: 'gedrückt', highLabel: 'gut' },
  { key: 'anxiety', label: 'Innere Unruhe / Angst', short: 'Unruhe', polarity: 'negative', lowLabel: 'ruhig', highLabel: 'sehr unruhig' },
  { key: 'drive', label: 'Antrieb / Motivation', short: 'Antrieb', polarity: 'positive', lowLabel: 'antriebslos', highLabel: 'motiviert' },
  { key: 'overstimulation', label: 'Reizoffenheit / Überstimulation', short: 'Reizoffenh.', polarity: 'negative', lowLabel: 'abgeschirmt', highLabel: 'überflutet' },
  { key: 'craving', label: 'Suchtdruck / Craving', short: 'Craving', polarity: 'negative', lowLabel: 'keiner', highLabel: 'sehr stark' },
  { key: 'pain', label: 'Schmerz', short: 'Schmerz', polarity: 'negative', lowLabel: 'schmerzfrei', highLabel: 'stark' },
];

export const METRIC_KEYS = METRICS.map((m) => m.key);
