import type { Metric } from './types';

/**
 * Lokale Kopie der 11 Assessment-Dimensionen (Fallback & sofort verfügbar,
 * auch offline). Identisch zur Server-Definition; der Server bleibt die
 * maßgebliche Quelle und kann via /api/metrics nachgeladen werden.
 */
export const METRICS: Metric[] = [
  { key: 'sleep_quality', label: 'Schlafqualität', short: 'Schlaf', polarity: 'positive', lowLabel: 'sehr schlecht', highLabel: 'erholsam' },
  { key: 'fatigue', label: 'Müdigkeit / Erschöpfung', short: 'Müdigkeit', polarity: 'negative', lowLabel: 'gar nicht', highLabel: 'extrem' },
  { key: 'stability', label: 'Stabilität', short: 'Stabilität', polarity: 'positive', lowLabel: 'labil', highLabel: 'stabil' },
  { key: 'psychotic_load', label: 'Psychotisch / Realitätsferne', short: 'Psychose', polarity: 'negative', lowLabel: 'gar nicht', highLabel: 'extrem' },
  { key: 'mood', label: 'Stimmung', short: 'Stimmung', polarity: 'positive', lowLabel: 'gedrückt', highLabel: 'gut' },
  { key: 'functioning', label: 'Leistung / Funktion im Alltag', short: 'Funktion', polarity: 'positive', lowLabel: 'kaum', highLabel: 'voll' },
  { key: 'anxiety', label: 'Angst / innere Anspannung', short: 'Angst', polarity: 'negative', lowLabel: 'gar nicht', highLabel: 'extrem' },
  { key: 'craving', label: 'Craving / Suchtdruck', short: 'Craving', polarity: 'negative', lowLabel: 'gar nicht', highLabel: 'extrem' },
  { key: 'overstimulation', label: 'Überstimulation / Getriebenheit', short: 'Überstim.', polarity: 'negative', lowLabel: 'gar nicht', highLabel: 'extrem' },
  { key: 'sedation', label: 'Sedierung / Benommenheit', short: 'Sedierung', polarity: 'negative', lowLabel: 'gar nicht', highLabel: 'extrem' },
  { key: 'pain', label: 'Schmerz / körperliche Beschwerden', short: 'Schmerz', polarity: 'negative', lowLabel: 'gar nicht', highLabel: 'extrem' },
];

export const METRIC_KEYS = METRICS.map((m) => m.key);
