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

// Reihenfolge & Polarität exakt nach import/konsum_tagebuch_skalen.md:
//   1 Schlafqualität · 2 Müdigkeit/Erschöpfung · 3 Stabilität ·
//   4 Psychotisch/Realitätsferne · 5 Stimmung · 6 Leistung/Funktion ·
//   7 Angst/innere Anspannung · 8 Craving/Suchtdruck ·
//   9 Überstimulation/Getriebenheit · 10 Sedierung/Benommenheit ·
//   11 Schmerz/körperliche Beschwerden
// Positiv (1=schlecht, 10=gut): 1,3,5,6 · negativ (1=gar nicht, 10=extrem): 2,4,7,8,9,10,11
export const METRICS: readonly MetricDef[] = [
  { key: 'sleep_quality',  label: 'Schlafqualität',                   short: 'Schlaf',        polarity: 'positive', lowLabel: 'sehr schlecht', highLabel: 'erholsam' },
  { key: 'fatigue',        label: 'Müdigkeit / Erschöpfung',          short: 'Müdigkeit',     polarity: 'negative', lowLabel: 'gar nicht',     highLabel: 'extrem' },
  { key: 'stability',      label: 'Stabilität',                       short: 'Stabilität',    polarity: 'positive', lowLabel: 'labil',         highLabel: 'stabil' },
  { key: 'psychotic_load', label: 'Psychotisch / Realitätsferne',     short: 'Psychose',      polarity: 'negative', lowLabel: 'gar nicht',     highLabel: 'extrem' },
  { key: 'mood',           label: 'Stimmung',                         short: 'Stimmung',      polarity: 'positive', lowLabel: 'gedrückt',      highLabel: 'gut' },
  { key: 'functioning',    label: 'Leistung / Funktion im Alltag',    short: 'Funktion',      polarity: 'positive', lowLabel: 'kaum',          highLabel: 'voll' },
  { key: 'anxiety',        label: 'Angst / innere Anspannung',        short: 'Angst',         polarity: 'negative', lowLabel: 'gar nicht',     highLabel: 'extrem' },
  { key: 'craving',        label: 'Craving / Suchtdruck',             short: 'Craving',       polarity: 'negative', lowLabel: 'gar nicht',     highLabel: 'extrem' },
  { key: 'overstimulation',label: 'Überstimulation / Getriebenheit',  short: 'Überstim.',     polarity: 'negative', lowLabel: 'gar nicht',     highLabel: 'extrem' },
  { key: 'sedation',       label: 'Sedierung / Benommenheit',         short: 'Sedierung',     polarity: 'negative', lowLabel: 'gar nicht',     highLabel: 'extrem' },
  { key: 'pain',           label: 'Schmerz / körperliche Beschwerden',short: 'Schmerz',       polarity: 'negative', lowLabel: 'gar nicht',     highLabel: 'extrem' },
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
