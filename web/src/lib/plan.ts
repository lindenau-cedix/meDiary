import type { PlanItem } from './types';

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
 * Normalisiert eine Dosis-/Mengen-Angabe für den *Vergleich* (nicht für die
 * Anzeige): umlaut-, whitespace- und einheiten-tolerant, damit "150mg",
 * "150 mg" und "150 MG" denselben Schlüssel ergeben. Dezimal-Komma wird zu
 * Punkt vereinheitlicht ("0,5" → "0.5"), ein abschließender Punkt fällt weg.
 * Leerer/Null-Wert → "" (matcht nie eine konkrete Plan-Dosis).
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

/** Zulässige Plan-Dosen einer Substanz (bereits über doseKey normalisiert). */
export interface PlanDoseEntry {
  /** Menge der zulässigen Dosis-Schlüssel. Leer = der Plan gibt für diese
   *  Substanz keine konkrete Dosis vor (dann genügt der Substanz-Match). */
  doses: Set<string>;
}

/**
 * Index nameKey → zulässige Plan-Dosen aus dem aktuell wirksamen Plan. Als
 * Dosis gilt jeder nicht-leere Slot-Wert (Morgens/Mittags/Abends/Nachts) sowie
 * die generische `strength` — der Markdown-Import legt die echte Dosis in die
 * Slots ("150 mg"), das Seed-/Formular-Format hält sie in `strength`. Der
 * Platzhalter "✓" (Slot ohne Mengenangabe) zählt NICHT als konkrete Dosis.
 *
 * Bewusst werden im Formular-/Seed-Format AUCH reine Stückzahlen aus den Slots
 * (z. B. "1" = 1 Tablette) als zulässige Dosis aufgenommen: der Ein-Tipp-
 * Sammeleintrag (`POST /api/intakes/plan-batch`) protokolliert genau diesen
 * Slot-Wert 1:1 als `amount`, weshalb "1" dort eine planmäßige Menge IST. In
 * den echten Markdown-Plandaten tragen die Slots reale Dosen (mit Einheit),
 * sodass gar keine nackten Stückzahlen entstehen — der Sonderfall ist also
 * auf das Formular-Modell begrenzt.
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
 * True, wenn die Einnahme *planmäßig* ist: Substanz steht im aktuell wirksamen
 * Plan UND ihre Dosis stimmt mit dem Plan überein. Gibt der Plan für die
 * Substanz keine konkrete Dosis vor (nur "✓" / kein Mengenwert), genügt der
 * Substanz-Match. Fehlt die Menge der Einnahme, während der Plan eine konkrete
 * Dosis vorgibt, gilt sie als NICHT planmäßig (Abweichung nicht verifizierbar).
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
