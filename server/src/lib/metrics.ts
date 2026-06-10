/**
 * Die 11 Tages-Assessment-Dimensionen, die nach Einnahme der
 * Nachtmedikation auf einer Skala von 1–10 abgefragt werden.
 *
 * `polarity`:
 *   'positive' = hoher Wert ist gut  (z. B. Schlafqualität)
 *   'negative' = hoher Wert ist schlecht (z. B. Schmerz)
 * Wird im Frontend für die Einfärbung der Trends genutzt.
 */
export type MetricPolarity = 'positive' | 'negative';

export interface MetricDef {
  key: string;
  label: string;
  short: string;
  polarity: MetricPolarity;
  /** kurze Orientierung an den Skalenenden (1 → 10) */
  lowLabel: string;
  highLabel: string;
}

export const METRICS: readonly MetricDef[] = [
  { key: 'sleep_quality',  label: 'Schlafqualität',                 short: 'Schlaf',        polarity: 'positive', lowLabel: 'sehr schlecht', highLabel: 'erholsam' },
  { key: 'fatigue',        label: 'Müdigkeit / Erschöpfung',        short: 'Müdigkeit',     polarity: 'negative', lowLabel: 'wach',          highLabel: 'erschöpft' },
  { key: 'stability',      label: 'Stabilität',                     short: 'Stabilität',    polarity: 'positive', lowLabel: 'labil',         highLabel: 'stabil' },
  { key: 'psychotic_load', label: 'Psychotische Symptomlast',       short: 'Psychose',      polarity: 'negative', lowLabel: 'keine',         highLabel: 'stark' },
  { key: 'functioning',    label: 'Leistung / Funktion',            short: 'Funktion',      polarity: 'positive', lowLabel: 'kaum',          highLabel: 'voll' },
  { key: 'mood',           label: 'Stimmung',                       short: 'Stimmung',      polarity: 'positive', lowLabel: 'gedrückt',      highLabel: 'gut' },
  { key: 'anxiety',        label: 'Innere Unruhe / Angst',          short: 'Unruhe',        polarity: 'negative', lowLabel: 'ruhig',         highLabel: 'sehr unruhig' },
  { key: 'drive',          label: 'Antrieb / Motivation',           short: 'Antrieb',       polarity: 'positive', lowLabel: 'antriebslos',   highLabel: 'motiviert' },
  { key: 'overstimulation',label: 'Reizoffenheit / Überstimulation',short: 'Reizoffenh.',   polarity: 'negative', lowLabel: 'abgeschirmt',   highLabel: 'überflutet' },
  { key: 'craving',        label: 'Suchtdruck / Craving',           short: 'Craving',       polarity: 'negative', lowLabel: 'keiner',        highLabel: 'sehr stark' },
  { key: 'pain',           label: 'Schmerz',                        short: 'Schmerz',       polarity: 'negative', lowLabel: 'schmerzfrei',   highLabel: 'stark' },
] as const;

export const METRIC_KEYS = METRICS.map((m) => m.key);

export function isValidScores(scores: Record<string, unknown>): boolean {
  return Object.entries(scores).every(
    ([k, v]) =>
      METRIC_KEYS.includes(k) &&
      typeof v === 'number' &&
      Number.isInteger(v) &&
      v >= 1 &&
      v <= 10,
  );
}
