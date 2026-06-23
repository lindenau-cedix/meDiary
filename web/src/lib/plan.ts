import type { Plan, PlanItem } from './types';

/**
 * Umlaut-bewusste Substanz-Normalisierung: gleicher Key für "Quetiapin" und
 * "quetiapin" (oder "CBD-Öl" und "cbd-öl"). Bewusst NICHT `String.toLowerCase`
 * (ASCII-only, würde "Ö" unverändert lassen) — wir nehmen die
 * ICU/CLDR-Variante, die der SQLite `lower()` entspricht, das die App
 * selbst nicht verwendet (siehe server/src/lib/names.ts).
 */
export function nameKey(name: string): string {
  return name.trim().toLocaleLowerCase('de');
}

/**
 * Menge aller Substanz-Namen aus dem aktuell wirksamen Plan — bereits zu
 * nameKey normalisiert. Ein Lookup über `nameKey(intake.substanceName)` ist
 * O(1) und damit billig genug für jede Intake-Zeile.
 */
export function planSubstanceKeys(plan: Plan | null | undefined): Set<string> {
  const keys = new Set<string>();
  if (!plan) return keys;
  for (const item of plan.items ?? []) {
    if (item.substanceName) keys.add(nameKey(item.substanceName));
  }
  return keys;
}

/**
 * True, wenn die Substanz Teil des aktuell wirksamen Plans ist. Damit
 * unterscheidet die UI zwischen geplanten und freien Einnahmen.
 */
export function isPlanIntake(name: string, planKeys: Set<string>): boolean {
  if (planKeys.size === 0) return false;
  return planKeys.has(nameKey(name));
}

export const DAYPARTS = [
  { key: 'morning', label: 'Morgens', short: 'M' },
  { key: 'noon', label: 'Mittags', short: 'Mi' },
  { key: 'evening', label: 'Abends', short: 'A' },
  { key: 'night', label: 'Nachts', short: 'N' },
] as const;

export const FIELD_LABELS: Record<string, string> = {
  strength: 'Stärke',
  morning: 'Morgens',
  noon: 'Mittags',
  evening: 'Abends',
  night: 'Nachts',
  unit: 'Einheit',
  reason: 'Grund',
  notes: 'Hinweis',
};

export function dosingSummary(item: PlanItem): string {
  return DAYPARTS.map((d) => (item[d.key] ? item[d.key] : '0')).join(' – ');
}

export function hasAnyDosing(item: PlanItem): boolean {
  return DAYPARTS.some((d) => !!item[d.key]);
}
