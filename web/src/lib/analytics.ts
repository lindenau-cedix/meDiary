/**
 * Analytics — reine Aggregations-/Mathematik-Schicht für den Statistik-Bereich.
 *
 * Bewusst frei von React/DOM: nimmt die vom Server gelieferten `Intake[]` /
 * `Substance[]` / `Assessment[]` entgegen und liefert plottbare Zwischenformen
 * (Tages-Buckets, Dosis-Serien, Ranglisten, Tageszeit-Verteilungen,
 * Korrelation). Der `StatistikScreen` ruft das per `useMemo`.
 *
 * Zeit-Semantik wie im Rest der App: lokale Wanduhrzeit-Strings, Konsum-Tag
 * mit Grenze 03:30 (`intake.date` ist serverseitig bereits aufgelöst; für die
 * Tageszeit-Verteilung zählt hingegen die echte Wanduhr-Stunde aus `takenAt`).
 *
 * WICHTIG: Freitext-Mengen ("150 mg", "1 Tablette", "0,5 mg", `null`) werden
 * NIE über Substanzen hinweg summiert — jede Dosis-Summe gilt pro Substanz und
 * pro Einheit. Substanzen ohne parsebare Menge erscheinen count-basiert.
 */
import type { Intake, Substance, SubstanceProfile, SubstanceServing, SubstanceProfileDTO } from './types';
import { nameKey } from './plan';
import { colorForName } from './format';
import { hourOf } from './time';
import { consumptionTodayOffset } from './time';

// ───────────────────────── Mengen-Parsing ─────────────────────────

export interface ParsedAmount {
  /** Zahlwert der Menge (bei Bereichen der Mittelwert). */
  value: number;
  /** Einheit, kleingeschrieben & normalisiert ("mg", "ml", "tablette", "%", "" = einheitenlos). */
  unit: string;
}

/** Häufige Einheiten-Synonyme/Plurale auf eine kanonische Form ziehen. */
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
 * Parst eine Freitext-Menge in `{ value, unit }`. Toleriert Dezimal-Komma,
 * fehlende Leerzeichen ("150mg") und Bereiche ("150–300 mg" → 225). Ohne
 * Zahlwert (reine Notiz, leer, `null`) → `null`; die Substanz zählt dann nur
 * count-basiert. Reine Zahl ohne Einheit ("1") → `{ value: 1, unit: '' }`.
 */
export function parseAmount(raw: string | null | undefined): ParsedAmount | null {
  if (!raw) return null;
  const norm = raw
    .trim()
    .toLocaleLowerCase('de')
    .replace(/[‐-―−]/g, '-') // – — − (Bereich-Striche) → "-"
    .replace(/(\d)\s*[.,]\s*(\d)/g, '$1.$2') // "0,5" / "0 . 5" → "0.5"
    .replace(/\s+/g, ' ')
    .trim();

  const nums = norm.match(/\d+(?:\.\d+)?/g);
  if (!nums || nums.length === 0) return null;

  // Bereich "a-b" → Mittelwert; sonst die erste Zahl.
  const range = norm.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/);
  const value = range ? (parseFloat(range[1]) + parseFloat(range[2])) / 2 : parseFloat(nums[0]);
  if (!isFinite(value)) return null;

  // Einheit = erstes Buchstaben-/Prozent-Token nach einer Zahl.
  const unitMatch = norm.match(/\d(?:[\d.]*)\s*([a-zäöüßµ%]+)/);
  const unit = unitMatch ? normalizeUnit(unitMatch[1]) : '';
  return { value, unit };
}

/** Anzeige einer Einheit (leer → "×" als generischer Stück-Marker). */
export function unitLabel(unit: string): string {
  return unit === '' ? '×' : unit;
}

// ───────────────────────── Farb-Resolver ─────────────────────────

/** Farbe einer Substanz: eigene Farbe > stabile Ableitung aus dem Namen. */
export function substanceColor(name: string, substances: Substance[]): string {
  const key = nameKey(name);
  const s = substances.find((x) => nameKey(x.name) === key);
  return s?.color || colorForName(name);
}

// ───────────────────────── Tages-Achse ─────────────────────────

/** Konsum-Tage des Zeitfensters, ALT → NEU (Länge = `range`). */
export function dayAxis(range: number): string[] {
  const out: string[] = [];
  for (let i = range - 1; i >= 0; i--) out.push(consumptionTodayOffset(i));
  return out;
}

// ───────────────────────── Rangliste ─────────────────────────

export interface SubstanceStat {
  /** Anzeigename (bevorzugt aus der Substanz-Tabelle). */
  name: string;
  /** nameKey (umlaut-bewusst normalisiert) — stabiler Gruppierungsschlüssel. */
  key: string;
  color: string;
  /** Einnahmen im Zeitfenster. */
  count: number;
  /** Anzahl Konsum-Tage mit ≥ 1 Einnahme. */
  daysUsed: number;
}

/** Substanzen nach Aktivität (Einnahmen, dann Tage) absteigend sortiert. */
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
    .sort((a, b) => b.count - a.count || b.daysUsed - a.daysUsed || a.name.localeCompare(b.name, 'de'));
}

// ───────────────────────── Konsum-Kalender (Punchcard) ─────────────────────────

export interface PunchRow {
  stat: SubstanceStat;
  /** Intensität 0…1 je Tag, ausgerichtet an `dayAxis` (relativ zur eigenen Spitze). */
  cells: number[];
  /** Rohanzahl der Einnahmen je Tag (für die Tap-Detailzeile). */
  counts: number[];
  /** Kurz-Mengenlabel je Tag (z. B. "300 mg", "2×") oder "" wenn leer. */
  labels: string[];
}

/**
 * Substanz × Tag-Matrix. Zeilen = Substanzen (nach Aktivität), Spalten = Tage
 * der `dayAxis`. Zell-Intensität = Einnahmen/Tag, je Zeile auf die eigene
 * Spitze normiert (macht auch selten genutzte Stoffe lesbar).
 */
export function punchcard(intakes: Intake[], substances: Substance[], days: string[]): PunchRow[] {
  const dayIndex = new Map(days.map((d, i) => [d, i]));
  const stats = ranking(intakes, substances);

  // Rohe Tages-Einnahmen + Mengen je Substanz.
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
  // Dominante Einheit je Substanz + Tagesdosis in dieser Einheit.
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

// ───────────────────────── Dosis über Zeit (pro Substanz) ─────────────────────────

export interface DoseDay {
  date: string;
  value: number;
  count: number;
}

export interface DailyDoseSeries {
  /** 'dose' = summierte Menge in `unit`; 'count' = Anzahl Einnahmen. */
  mode: 'dose' | 'count';
  unit: string;
  days: DoseDay[];
  total: number;
  /** Ø über Tage MIT Einnahme. */
  avgPerActiveDay: number;
  /** Anteil Einnahmen, deren Menge in `unit` parsebar war (nur Info bei 'dose'). */
  coverage: number;
}

/**
 * Tages-Serie einer Substanz. Wenn ≥ 60 % der Einnahmen dieselbe parsebare
 * Einheit tragen → Dosis-Summe in dieser Einheit ('dose'); sonst Fallback auf
 * Anzahl Einnahmen/Tag ('count'). `days` deckt die gesamte Achse ab (0 an
 * Tagen ohne Einnahme), damit der Balkenchart Lücken zeigt.
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

// ───────────────────────── Tageszeit-Muster ─────────────────────────

export type Daypart = 'morning' | 'noon' | 'evening' | 'night';

export const DAYPART_DEFS: { key: Daypart; label: string; range: string }[] = [
  { key: 'morning', label: 'Morgens', range: '5–11' },
  { key: 'noon', label: 'Mittags', range: '11–15' },
  { key: 'evening', label: 'Abends', range: '15–21' },
  { key: 'night', label: 'Nachts', range: '21–5' },
];

/** Tagesabschnitt aus der echten Wanduhr-Stunde von `takenAt`. */
export function daypartOf(takenAt: string): Daypart {
  const h = hourOf(takenAt);
  if (h >= 5 && h < 11) return 'morning';
  if (h >= 11 && h < 15) return 'noon';
  if (h >= 15 && h < 21) return 'evening';
  return 'night';
}

export interface DaypartDistribution {
  counts: Record<Daypart, number>;
  /** 24 Werte (Stunde 0…23) für das feine Histogramm. */
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

// ───────────────────────── Korrelation ─────────────────────────

/**
 * Pearson-Korrelationskoeffizient über gepaarte Werte. `null`, wenn < 3 Paare
 * oder eine Reihe keine Varianz hat (dann ist `r` nicht sinnvoll definiert).
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

/** Klartext-Einordnung eines Korrelationskoeffizienten. */
export function correlationLabel(r: number): string {
  const a = Math.abs(r);
  const strength = a < 0.2 ? 'kein' : a < 0.4 ? 'schwacher' : a < 0.6 ? 'moderater' : a < 0.8 ? 'deutlicher' : 'starker';
  if (a < 0.2) return 'kein erkennbarer Zusammenhang';
  const dir = r > 0 ? 'gleichläufiger' : 'gegenläufiger';
  return `${strength}, ${dir} Zusammenhang`;
}

// ───────────────────────── Zahl-Formatierung ─────────────────────────

/** Kompakte Zahl: bis 2 Nachkommastellen, ohne überflüssige Nullen. */
export function formatNum(n: number): string {
  if (!isFinite(n)) return '–';
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace('.', ',');
}

/** Masse lesbar: mg bis < 1 g, danach in g. */
export function formatMass(mg: number): string {
  if (!isFinite(mg)) return '–';
  if (mg >= 1000) return `${formatNum(mg / 1000)} g`;
  return `${formatNum(mg)} mg`;
}

// ───────────────────────── Wirkstoff-Bilanz (KI-Profile) ─────────────────────────
// Deterministische Hochrechnung: Das KI-Profil liefert je Substanz „so viel
// Wirkstoff pro Portion" + eine Portionsdefinition; hier wird die tatsächlich
// protokollierte Freitext-Menge in Portionen umgerechnet und mit dem Gehalt
// multipliziert. Ergebnis wird quellenübergreifend pro Wirkstoff summiert
// (z. B. Gesamt-Koffein aus Energy-Drink + Cola + Kaffee).

const MASS_TO_MG: Record<string, number> = { mg: 1, g: 1000, kg: 1_000_000, µg: 0.001, mcg: 0.001, ug: 0.001 };
const VOL_TO_ML: Record<string, number> = { ml: 1, cl: 10, dl: 100, l: 1000 };

function isMassUnit(u: string): boolean {
  return u in MASS_TO_MG;
}
function isVolUnit(u: string): boolean {
  return u in VOL_TO_ML;
}
/** „Zählbare" Einheit (Dose, Glas, Tablette, Tasse …) oder gar keine Einheit. */
function isCountUnit(u: string): boolean {
  return u === '' || (!isMassUnit(u) && !isVolUnit(u) && u !== '%');
}

/**
 * Rechnet eine geparste Menge in „Portionen" der Substanz um (oder null, wenn
 * nicht auflösbar). Präzedenz: gleiche Einheit → gleiche Masse/Volumen-Familie
 * → Volumen/Masse über die physische Portionsgröße (`milliliters`/`grams`) →
 * zählbare Einheit = Anzahl Portionen.
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
  if (isCountUnit(pu)) return parsed.value; // "1 Dose" / "2" / "1 Glas" = N Portionen
  return null;
}

export interface CompoundContribution {
  compound: string;
  label: string;
  category: string;
  mg: number;
}

/**
 * Wirkstoff-Beiträge EINER Einnahme laut Profil. `null` = Menge nicht
 * auflösbar (→ „unquantifiziert"); `[]` = auflösbar, aber Profil ohne
 * nennenswerte Wirkstoffe.
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
  /** Gesamt-mg im Zeitraum (quellenübergreifend). */
  totalMg: number;
  /** mg je Tag, ausgerichtet an der Tages-Achse. */
  perDay: number[];
  /** Ø-mg über Tage MIT Beitrag. */
  avgPerActiveDay: number;
  /** Beitrag je Quell-Substanz, absteigend. */
  bySource: CompoundSource[];
  /** Tage mit ≥ 1 Beitrag. */
  daysActive: number;
  /** Einnahmen quantifizierter Quell-Substanzen, deren Menge NICHT auflösbar war. */
  unquantified: number;
}

/**
 * Aggregiert alle Einnahmen über die (gecachten) KI-Profile zu Wirkstoff-
 * Berichten. Nur Substanzen MIT Profil tragen bei; nicht auflösbare Mengen
 * werden je betroffenem Wirkstoff als `unquantified` gezählt (ehrlicher Hinweis
 * in der UI). Sortiert nach Gesamt-mg absteigend.
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
    if (!dto) continue; // Substanz (noch) nicht analysiert
    const di = dayIndex.get(it.date);
    if (di === undefined) continue;
    const contrib = applyProfile(it, dto.profile);
    if (contrib == null) {
      // Nicht auflösbar → je Wirkstoff des Profils als unquantifiziert zählen.
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
    .sort((a, b) => b.totalMg - a.totalMg || a.label.localeCompare(b.label, 'de'));
}

/** Anschauliche Vergleichsgröße für einen Wirkstoff-Betrag (oder null). */
const EQUIV: Record<string, { mgPerUnit: number; unit: string }> = {
  caffeine: { mgPerUnit: 80, unit: 'Tassen Kaffee' },
  alcohol: { mgPerUnit: 12000, unit: 'Standardgläser' }, // 12 g reiner Alkohol / Standardglas
  sugar: { mgPerUnit: 3000, unit: 'Zuckerwürfel' }, // ~3 g / Würfel
  nicotine: { mgPerUnit: 1, unit: 'Zigaretten' }, // ~1 mg aufgenommen / Zigarette
};

export function equivalentFor(compound: string, mg: number): { value: number; unit: string } | null {
  const e = EQUIV[compound];
  if (!e || mg <= 0) return null;
  return { value: mg / e.mgPerUnit, unit: e.unit };
}
