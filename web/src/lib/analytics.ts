/**
 * Analytics — pure aggregation/mathematics layer for the statistics area.
 *
 * Deliberately independent of React/DOM: accepts the server-provided `Intake[]`,
 * `Substance[]`, and `Assessment[]` and returns plottable intermediate forms
 * (daily buckets, dose series, rankings, daypart distributions, correlations).
 * `StatistikScreen` invokes these through `useMemo`.
 *
 * Time semantics match the rest of the app: local wall-clock strings and a
 * consumption day with a 03:30 boundary (`intake.date` is already resolved by
 * the server; the daypart distribution instead uses the actual hour in `takenAt`).
 *
 * IMPORTANT: free-text amounts ("150 mg", "1 Tablette", "0,5 mg", `null`) are
 * NEVER summed across substances — each dose total applies per substance and
 * per unit. Substances without a parseable amount are represented by count.
 */
import type { Intake, Substance, SubstanceProfile, SubstanceServing, SubstanceProfileDTO } from './types';
import { nameKey } from './plan';
import { colorForName } from './format';
import { activeIntlLocale, translate } from './i18n';
import { hourOf } from './time';
import { consumptionTodayOffset } from './time';

// ───────────────────────── Amount parsing ─────────────────────────

export interface ParsedAmount {
  /** Numeric amount (the midpoint for ranges). */
  value: number;
  /** Unit, lower-cased and normalised ("mg", "ml", "tablette", "%", "" = unitless). */
  unit: string;
}

/** Normalise common unit synonyms and plurals to a canonical form. */
const UNIT_ALIASES: Record<string, string> = {
  tabletten: 'tablette',
  tbl: 'tablette',
  tab: 'tablette',
  tabs: 'tablette',
  kapseln: 'kapsel',
  kaps: 'kapsel',
  stk: 'stück',
  stueck: 'stück',
  stücke: 'stück',
  tropfens: 'tropfen',
  hübe: 'hub',
  huebe: 'hub',
  sprühstöße: 'hub',
  µg: 'µg',
  mcg: 'µg',
  ug: 'µg',
};

function normalizeUnit(raw: string): string {
  const u = raw.trim().toLocaleLowerCase('de');
  return UNIT_ALIASES[u] ?? u;
}

/**
 * Parse a free-text amount into `{ value, unit }`. Accepts decimal commas,
 * missing spaces ("150mg"), and ranges ("150–300 mg" → 225). Without a numeric
 * value (note only, empty, or `null`) it returns `null`, so the substance is
 * counted only. A bare number ("1") yields `{ value: 1, unit: '' }`.
 */
export function parseAmount(raw: string | null | undefined): ParsedAmount | null {
  if (!raw) return null;
  const norm = raw
    .trim()
    .toLocaleLowerCase('de')
    .replace(/[‐-―−]/g, '-') // – — − (range dashes) → "-"
    .replace(/(\d)\s*[.,]\s*(\d)/g, '$1.$2') // "0,5" / "0 . 5" → "0.5"
    .replace(/\s+/g, ' ')
    .trim();

  const nums = norm.match(/\d+(?:\.\d+)?/g);
  if (!nums || nums.length === 0) return null;

  // Range "a-b" → midpoint; otherwise use the first number.
  const range = norm.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/);
  const value = range ? (parseFloat(range[1]) + parseFloat(range[2])) / 2 : parseFloat(nums[0]);
  if (!isFinite(value)) return null;

  // Unit = first letter/percent token after a number.
  const unitMatch = norm.match(/\d(?:[\d.]*)\s*([a-zäöüßµ%]+)/);
  const unit = unitMatch ? normalizeUnit(unitMatch[1]) : '';
  return { value, unit };
}

/** Display a unit (empty → "×" as a generic count marker). */
export function unitLabel(unit: string): string {
  return unit === '' ? '×' : unit;
}

// ───────────────────────── Colour resolver ─────────────────────────

/** Substance colour: explicit colour > stable derivation from its name. */
export function substanceColor(name: string, substances: Substance[]): string {
  const key = nameKey(name);
  const s = substances.find((x) => nameKey(x.name) === key);
  return s?.color || colorForName(name);
}

// ───────────────────────── Day axis ─────────────────────────

/** Consumption days in the window, OLD → NEW (length = `range`). */
export function dayAxis(range: number): string[] {
  const out: string[] = [];
  for (let i = range - 1; i >= 0; i--) out.push(consumptionTodayOffset(i));
  return out;
}

// ───────────────────────── Ranking ─────────────────────────

export interface SubstanceStat {
  /** Display name (prefer the substance table value). */
  name: string;
  /** nameKey (umlaut-aware normalisation) — stable grouping key. */
  key: string;
  color: string;
  /** Intakes in the time window. */
  count: number;
  /** Number of consumption days with ≥ 1 intake. */
  daysUsed: number;
}

/** Substances sorted by activity descending (intakes, then days). */
export function ranking(intakes: Intake[], substances: Substance[]): SubstanceStat[] {
  const byKey = new Map<string, { name: string; count: number; days: Set<string> }>();
  for (const it of intakes) {
    const key = nameKey(it.substanceName);
    const cur = byKey.get(key) ?? { name: it.substanceName, count: 0, days: new Set<string>() };
    cur.count += 1;
    cur.days.add(it.date);
    byKey.set(key, cur);
  }
  const nameFor = (key: string, fallback: string) =>
    substances.find((s) => nameKey(s.name) === key)?.name ?? fallback;
  return [...byKey.entries()]
    .map(([key, v]) => ({
      key,
      name: nameFor(key, v.name),
      color: substanceColor(v.name, substances),
      count: v.count,
      daysUsed: v.days.size,
    }))
    .sort((a, b) => b.count - a.count || b.daysUsed - a.daysUsed || a.name.localeCompare(b.name, activeIntlLocale()));
}

// ───────────────────────── Consumption calendar (punchcard) ─────────────────────────

export interface PunchRow {
  stat: SubstanceStat;
  /** Intensity 0…1 per day, aligned with `dayAxis` (relative to its own peak). */
  cells: number[];
  /** Raw intake count per day (for the tap-detail row). */
  counts: number[];
  /** Short amount label per day (for example, "300 mg", "2×"), or "" when empty. */
  labels: string[];
}

/**
 * Substance × day matrix. Rows = substances (by activity), columns = days on
 * `dayAxis`. Cell intensity = intakes/day, normalised to each row’s own peak
 * (keeping rarely used substances readable).
 */
export function punchcard(intakes: Intake[], substances: Substance[], days: string[]): PunchRow[] {
  const dayIndex = new Map(days.map((d, i) => [d, i]));
  const stats = ranking(intakes, substances);

  // Raw daily intakes and amounts per substance.
  const perKey = new Map<string, { counts: number[]; amounts: number[]; unit: string }>();
  for (const st of stats) perKey.set(st.key, { counts: new Array(days.length).fill(0), amounts: new Array(days.length).fill(0), unit: '' });

  const unitVotes = new Map<string, Map<string, number>>();
  for (const it of intakes) {
    const key = nameKey(it.substanceName);
    const bucket = perKey.get(key);
    const di = dayIndex.get(it.date);
    if (!bucket || di === undefined) continue;
    bucket.counts[di] += 1;
    const parsed = parseAmount(it.amount);
    if (parsed) {
      const votes = unitVotes.get(key) ?? new Map<string, number>();
      votes.set(parsed.unit, (votes.get(parsed.unit) ?? 0) + 1);
      unitVotes.set(key, votes);
    }
  }
  // Dominant unit per substance and daily dose in that unit.
  for (const st of stats) {
    const votes = unitVotes.get(st.key);
    const unit = votes ? [...votes.entries()].sort((a, b) => b[1] - a[1])[0][0] : '';
    const bucket = perKey.get(st.key)!;
    bucket.unit = unit;
  }
  for (const it of intakes) {
    const key = nameKey(it.substanceName);
    const bucket = perKey.get(key);
    const di = dayIndex.get(it.date);
    if (!bucket || di === undefined) continue;
    const parsed = parseAmount(it.amount);
    if (parsed && parsed.unit === bucket.unit) bucket.amounts[di] += parsed.value;
  }

  return stats.map((st) => {
    const bucket = perKey.get(st.key)!;
    const max = Math.max(1, ...bucket.counts);
    return {
      stat: st,
      cells: bucket.counts.map((c) => (c === 0 ? 0 : 0.28 + 0.72 * (c / max))),
      counts: bucket.counts,
      labels: bucket.counts.map((c, i) => {
        if (c === 0) return '';
        const dose = bucket.amounts[i];
        if (dose > 0) return `${formatNum(dose)} ${unitLabel(bucket.unit)}`.trim();
        return `${c}×`;
      }),
    };
  });
}

// ───────────────────────── Dose over time (per substance) ─────────────────────────

export interface DoseDay {
  date: string;
  value: number;
  count: number;
}

export interface DailyDoseSeries {
  /** 'dose' = total amount in `unit`; 'count' = number of intakes. */
  mode: 'dose' | 'count';
  unit: string;
  days: DoseDay[];
  total: number;
  /** Average over days WITH an intake. */
  avgPerActiveDay: number;
  /** Share of intakes whose amount was parseable in `unit` (informational for 'dose'). */
  coverage: number;
}

/**
 * Daily series for one substance. If ≥ 60% of intakes share the same parseable
 * unit, return the dose total in that unit ('dose'); otherwise fall back to
 * intakes/day ('count'). `days` covers the full axis (zero on days without an
 * intake), allowing the bar chart to show gaps.
 */
export function dailyDoseSeries(intakesOfSubstance: Intake[], days: string[]): DailyDoseSeries {
  const dayIndex = new Map(days.map((d, i) => [d, i]));
  const counts = new Array(days.length).fill(0);
  const doses = new Array(days.length).fill(0);

  const votes = new Map<string, number>();
  let parsedCount = 0;
  for (const it of intakesOfSubstance) {
    const p = parseAmount(it.amount);
    if (p) {
      votes.set(p.unit, (votes.get(p.unit) ?? 0) + 1);
      parsedCount += 1;
    }
  }
  const unit = votes.size ? [...votes.entries()].sort((a, b) => b[1] - a[1])[0][0] : '';
  const unitCount = votes.get(unit) ?? 0;
  const coverage = intakesOfSubstance.length ? unitCount / intakesOfSubstance.length : 0;
  const mode: 'dose' | 'count' = parsedCount > 0 && coverage >= 0.6 ? 'dose' : 'count';

  for (const it of intakesOfSubstance) {
    const di = dayIndex.get(it.date);
    if (di === undefined) continue;
    counts[di] += 1;
    if (mode === 'dose') {
      const p = parseAmount(it.amount);
      if (p && p.unit === unit) doses[di] += p.value;
    }
  }

  const values = mode === 'dose' ? doses : counts;
  const daysOut: DoseDay[] = days.map((date, i) => ({ date, value: values[i], count: counts[i] }));
  const total = values.reduce((a: number, b: number) => a + b, 0);
  const activeDays = daysOut.filter((d) => d.count > 0).length;
  return {
    mode,
    unit,
    days: daysOut,
    total,
    avgPerActiveDay: activeDays ? total / activeDays : 0,
    coverage,
  };
}

// ───────────────────────── Time-of-day pattern ─────────────────────────

export type Daypart = 'morning' | 'noon' | 'evening' | 'night';

export const DAYPART_DEFS: { key: Daypart; range: string }[] = [
  { key: 'morning', range: '5–11' },
  { key: 'noon', range: '11–15' },
  { key: 'evening', range: '15–21' },
  { key: 'night', range: '21–5' },
];

/** Daypart from the actual wall-clock hour in `takenAt`. */
export function daypartOf(takenAt: string): Daypart {
  const h = hourOf(takenAt);
  if (h >= 5 && h < 11) return 'morning';
  if (h >= 11 && h < 15) return 'noon';
  if (h >= 15 && h < 21) return 'evening';
  return 'night';
}

export interface DaypartDistribution {
  counts: Record<Daypart, number>;
  /** 24 values (hours 0…23) for the detailed histogram. */
  hours: number[];
  total: number;
}

export function daypartDistribution(intakes: Intake[]): DaypartDistribution {
  const counts: Record<Daypart, number> = { morning: 0, noon: 0, evening: 0, night: 0 };
  const hours = new Array(24).fill(0);
  for (const it of intakes) {
    counts[daypartOf(it.takenAt)] += 1;
    const h = hourOf(it.takenAt);
    if (h >= 0 && h < 24) hours[h] += 1;
  }
  return { counts, hours, total: intakes.length };
}

// ───────────────────────── Correlation ─────────────────────────

/**
 * Pearson correlation coefficient over paired values. Returns `null` with fewer
 * than three pairs or when one series has no variance (where `r` is undefined).
 */
export function pearson(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i];
    sy += ys[i];
    sxx += xs[i] * xs[i];
    syy += ys[i] * ys[i];
    sxy += xs[i] * ys[i];
  }
  const cov = sxy - (sx * sy) / n;
  const vx = sxx - (sx * sx) / n;
  const vy = syy - (sy * sy) / n;
  if (vx <= 0 || vy <= 0) return null;
  return cov / Math.sqrt(vx * vy);
}

/** Klartext-Einordnung eines Correlationskoeffizienten. */
export function correlationLabel(r: number): string {
  const a = Math.abs(r);
  if (a < 0.2) return translate('stats.wellbeing.correlation.none');
  const strength = a < 0.4 ? 'weak' : a < 0.6 ? 'moderate' : a < 0.8 ? 'clear' : 'strong';
  const direction = r > 0 ? 'Positive' : 'Negative';
  return translate(`stats.wellbeing.correlation.${strength}${direction}`);
}

// ───────────────────────── Number formatting ─────────────────────────

/** Compact number: up to two decimal places, without redundant zeros. */
export function formatNum(n: number): string {
  if (!isFinite(n)) return '–';
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace('.', ',');
}

/** Readable mass: mg below 1 g, then g. */
export function formatMass(mg: number): string {
  if (!isFinite(mg)) return '–';
  if (mg >= 1000) return `${formatNum(mg / 1000)} g`;
  return `${formatNum(mg)} mg`;
}

// ───────────────────────── Active-ingredient balance (AI profiles) ─────────────────────────
// Deterministic scaling: the AI profile supplies the active ingredient per serving
// and a serving definition for each substance. The recorded free-text amount is
// converted to servings and multiplied by that content. Results are summed per
// active ingredient across sources (for example, total caffeine from energy
// drinks, cola, and coffee).

const MASS_TO_MG: Record<string, number> = { mg: 1, g: 1000, kg: 1_000_000, µg: 0.001, mcg: 0.001, ug: 0.001 };
const VOL_TO_ML: Record<string, number> = { ml: 1, cl: 10, dl: 100, l: 1000 };

function isMassUnit(u: string): boolean {
  return u in MASS_TO_MG;
}
function isVolUnit(u: string): boolean {
  return u in VOL_TO_ML;
}
/** A countable unit (can, glass, tablet, cup, etc.) or no unit. */
function isCountUnit(u: string): boolean {
  return u === '' || (!isMassUnit(u) && !isVolUnit(u) && u !== '%');
}

/**
 * Convert a parsed amount to servings of the substance (or null when it cannot be
 * resolved). Precedence: same unit → same mass/volume family → volume/mass via
 * physical serving size (`milliliters`/`grams`) → countable unit = servings.
 */
export function scaleServings(parsed: ParsedAmount, serving: SubstanceServing): number | null {
  const pu = parsed.unit;
  const su = serving.unit;
  const sv = serving.value > 0 ? serving.value : 1;

  if (pu === su) return parsed.value / sv;
  if (isMassUnit(pu) && isMassUnit(su)) return (parsed.value * MASS_TO_MG[pu]) / (sv * MASS_TO_MG[su]);
  if (isVolUnit(pu) && isVolUnit(su)) return (parsed.value * VOL_TO_ML[pu]) / (sv * VOL_TO_ML[su]);
  if (isVolUnit(pu) && serving.milliliters && serving.milliliters > 0)
    return (parsed.value * VOL_TO_ML[pu]) / serving.milliliters;
  if (isMassUnit(pu) && serving.grams && serving.grams > 0)
    return (parsed.value * MASS_TO_MG[pu]) / (serving.grams * 1000);
  if (isCountUnit(pu)) return parsed.value; // "1 Dose" / "2" / "1 Glas" = N servings
  return null;
}

export interface CompoundContribution {
  compound: string;
  label: string;
  category: string;
  mg: number;
}

/**
 * Active-ingredient contributions from ONE intake according to its profile.
 * `null` means the amount cannot be resolved (unquantified); `[]` means it is
 * resolvable but the profile has no notable active ingredients.
 */
export function applyProfile(intake: Pick<Intake, 'amount'>, profile: SubstanceProfile): CompoundContribution[] | null {
  const parsed = parseAmount(intake.amount);
  if (!parsed) return null;
  const servings = scaleServings(parsed, profile.serving);
  if (servings == null || !isFinite(servings) || servings <= 0) return null;
  return profile.ingredients.map((ing) => ({
    compound: ing.compound,
    label: ing.label,
    category: ing.category,
    mg: ing.mgPerServing * servings,
  }));
}

export interface CompoundSource {
  key: string;
  name: string;
  color: string;
  mg: number;
}

export interface CompoundReport {
  compound: string;
  label: string;
  category: string;
  /** Total mg in the period (across sources). */
  totalMg: number;
  /** mg je Tag, ausgerichtet an der Day axis. */
  perDay: number[];
  /** Average mg over days WITH a contribution. */
  avgPerActiveDay: number;
  /** Contribution per source substance, descending. */
  bySource: CompoundSource[];
  /** Days with ≥ 1 contribution. */
  daysActive: number;
  /** Intakes from quantified source substances whose amount could NOT be resolved. */
  unquantified: number;
}

/**
 * Aggregate all intakes through cached AI profiles into active-ingredient reports.
 * Only substances WITH profiles contribute; unresolved amounts are counted as
 * `unquantified` for each affected ingredient (for an honest UI note). Sorted by
 * total mg descending.
 */
export function compoundReports(
  intakes: Intake[],
  profilesByKey: Record<string, SubstanceProfileDTO>,
  substances: Substance[],
  days: string[],
): CompoundReport[] {
  const dayIndex = new Map(days.map((d, i) => [d, i]));
  interface Acc {
    compound: string;
    label: string;
    category: string;
    totalMg: number;
    perDay: number[];
    bySource: Map<string, CompoundSource>;
    unquantified: number;
  }
  const acc = new Map<string, Acc>();
  const ensure = (c: CompoundContribution): Acc => {
    let a = acc.get(c.compound);
    if (!a) {
      a = { compound: c.compound, label: c.label, category: c.category, totalMg: 0, perDay: new Array(days.length).fill(0), bySource: new Map(), unquantified: 0 };
      acc.set(c.compound, a);
    }
    return a;
  };

  for (const it of intakes) {
    const key = nameKey(it.substanceName);
    const dto = profilesByKey[key];
    if (!dto) continue; // Substance not analysed (yet)
    const di = dayIndex.get(it.date);
    if (di === undefined) continue;
    const contrib = applyProfile(it, dto.profile);
    if (contrib == null) {
      // Unresolved → count as unquantified for each ingredient in the profile.
      for (const ing of dto.profile.ingredients) {
        const a = ensure({ compound: ing.compound, label: ing.label, category: ing.category, mg: 0 });
        a.unquantified += 1;
      }
      continue;
    }
    for (const c of contrib) {
      if (c.mg <= 0) continue;
      const a = ensure(c);
      a.perDay[di] += c.mg;
      a.totalMg += c.mg;
      const src = a.bySource.get(key) ?? { key, name: dto.name, color: substanceColor(dto.name, substances), mg: 0 };
      src.mg += c.mg;
      a.bySource.set(key, src);
    }
  }

  return [...acc.values()]
    .map((a): CompoundReport => {
      const daysActive = a.perDay.filter((v) => v > 0).length;
      return {
        compound: a.compound,
        label: a.label,
        category: a.category,
        totalMg: a.totalMg,
        perDay: a.perDay,
        avgPerActiveDay: daysActive ? a.totalMg / daysActive : 0,
        bySource: [...a.bySource.values()].sort((x, y) => y.mg - x.mg),
        daysActive,
        unquantified: a.unquantified,
      };
    })
    .filter((r) => r.totalMg > 0 || r.unquantified > 0)
    .sort((a, b) => b.totalMg - a.totalMg || a.label.localeCompare(b.label, activeIntlLocale()));
}

/** Illustrative equivalent for an active-ingredient amount (or null). */
const EQUIV: Record<string, { mgPerUnit: number; kind: 'coffee' | 'alcohol' | 'sugar' | 'nicotine' }> = {
  caffeine: { mgPerUnit: 80, kind: 'coffee' },
  alcohol: { mgPerUnit: 12000, kind: 'alcohol' }, // 12 g pure alcohol per standard drink
  sugar: { mgPerUnit: 3000, kind: 'sugar' }, // ~3 g per cube
  nicotine: { mgPerUnit: 1, kind: 'nicotine' }, // ~1 mg absorbed per cigarette
};

export function equivalentFor(compound: string, mg: number): { value: number; kind: 'coffee' | 'alcohol' | 'sugar' | 'nicotine' } | null {
  const e = EQUIV[compound];
  if (!e || mg <= 0) return null;
  return { value: mg / e.mgPerUnit, kind: e.kind };
}
