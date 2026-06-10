import type { PlanItem } from './types';

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
