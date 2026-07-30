import type { PlanItem } from './types';
import { translate, type MessageKey } from './i18n';

/**
 * Umlaut-aware substance normalisation: the same key for "Quetiapin" and
 * "quetiapin" (or "CBD-Öl" and "cbd-öl"). Deliberately NOT
 * `String.toLowerCase` (ASCII-only, it would leave "Ö" untouched) — we use the
 * ICU/CLDR variant. The `'de'` tag is a DATA INVARIANT, not a UI language
 * setting: it must not follow the selected locale (see server/src/lib/names.ts).
 */
export function nameKey(name: string): string {
  return name.trim().toLocaleLowerCase('de');
}

/**
 * Normalises a dose/amount value for *comparison* (not for display):
 * tolerant of umlauts, whitespace and unit spacing, so "150mg", "150 mg" and
 * "150 MG" all yield the same key. A decimal comma is unified to a dot
 * ("0,5" → "0.5") and a trailing dot is dropped. Empty/null → "" (never
 * matches a concrete plan dose).
 */
export function doseKey(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw
    .trim()
    .toLocaleLowerCase('de')
    .replace(/[‐-―−]/g, '-')  // – — − (Range-Striche) → "-"
    .replace(/(\d)\s*[.,]\s*(\d)/g, '$1.$2') // "0,5" / "0 , 5" → "0.5"
    .replace(/(\d)([a-zäöüßµ])/g, '$1 $2')   // "150mg" → "150 mg"
    .replace(/\s*%/g, '%')                   // "5 %" → "5%"
    .replace(/\s+/g, ' ')
    .replace(/\.+$/, '')
    .trim();
}

/** Permitted plan doses for a substance (already normalised via doseKey). */
export interface PlanDoseEntry {
  /** Set of permitted dose keys. Empty = the plan prescribes no concrete dose
   *  for this substance (a substance match is then sufficient). */
  doses: Set<string>;
}

/**
 * Index nameKey → permitted plan doses from the currently effective plan. Every
 * non-empty slot value (morning/noon/evening/night) counts as a dose, as does
 * the generic `strength` — the Markdown import puts the real dose into the slots
 * ("150 mg"), while the seed/form format keeps it in `strength`. The placeholder
 * "✓" (a slot without an amount) does NOT count as a concrete dose.
 *
 * In the form/seed format, bare unit counts from the slots (for example "1" =
 * 1 tablet) are deliberately accepted as valid doses too: the one-tap collective
 * entry (`POST /api/intakes/plan-batch`) logs exactly that slot value verbatim as
 * `amount`, which makes "1" a scheduled amount there. Real Markdown plan data
 * carries actual doses (with units) in the slots, so no bare counts arise —
 * the special case is therefore limited to the form model.
 */
export function planDoseIndex(plan: { items?: PlanItem[] | null } | null | undefined): Map<string, PlanDoseEntry> {
  const map = new Map<string, PlanDoseEntry>();
  if (!plan) return map;
  for (const item of plan.items ?? []) {
    if (!item.substanceName) continue;
    const key = nameKey(item.substanceName);
    const entry = map.get(key) ?? { doses: new Set<string>() };
    for (const raw of [item.morning, item.noon, item.evening, item.night, item.strength]) {
      const d = doseKey(raw);
      if (d && d !== '✓') entry.doses.add(d);
    }
    map.set(key, entry);
  }
  return map;
}

/**
 * True when the intake is *as scheduled*: the substance appears in the currently
 * effective plan AND its dose matches the plan. If the plan prescribes no
 * concrete dose for the substance (only "✓" / no amount), a substance match is
 * sufficient. If the intake has no amount while the plan does prescribe a
 * concrete dose, it counts as NOT scheduled (the deviation is unverifiable).
 */
export function isPlanIntake(
  intake: { substanceName: string; amount: string | null },
  index: Map<string, PlanDoseEntry>,
): boolean {
  const entry = index.get(nameKey(intake.substanceName));
  if (!entry) return false;
  if (entry.doses.size === 0) return true;
  return entry.doses.has(doseKey(intake.amount));
}

/**
 * The four plan slots in canonical order.
 *
 * Kept as a `const` tuple of bare keys so the literal types survive and
 * `item[key]` still type-checks against `PlanItem`. Labels are *not* stored
 * here — they depend on the active locale (see `daypartList()`).
 */
export const DAYPART_KEYS = ['morning', 'noon', 'evening', 'night'] as const;

export type DaypartKey = (typeof DAYPART_KEYS)[number];

/**
 * Dayparts with labels in the active locale. A function, not a constant, so a
 * language switch produces fresh strings on the next render.
 */
export function daypartList(): { key: DaypartKey; label: string; short: string }[] {
  return DAYPART_KEYS.map((key) => ({
    key,
    label: translate(`daypart.${key}` as MessageKey),
    short: translate(`daypart.${key}.short` as MessageKey),
  }));
}

/**
 * Label for a plan *diff* field: the four slots plus the metadata fields.
 * Unknown fields fall back to the raw name, matching the previous
 * `FIELD_LABELS[f] ?? f` behaviour at the call site.
 */
export function planFieldLabel(field: string): string {
  if ((DAYPART_KEYS as readonly string[]).includes(field)) {
    return translate(`daypart.${field}` as MessageKey);
  }
  if (field === 'strength' || field === 'unit' || field === 'reason' || field === 'notes') {
    return translate(`planField.${field}` as MessageKey);
  }
  return field;
}

export function dosingSummary(item: PlanItem): string {
  return DAYPART_KEYS.map((key) => item[key] || '0').join(' – ');
}

export function hasAnyDosing(item: PlanItem): boolean {
  return DAYPART_KEYS.some((key) => !!item[key]);
}
