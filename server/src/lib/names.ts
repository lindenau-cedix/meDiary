/**
 * Case-insensitive, Unicode-aware Schlüssel für Substanz-Namen.
 *
 * SQLite's eingebautes `lower()` ist ASCII-only und lässt z. B. "Ö"
 * unverändert – für deutsche Namen wie "CBD-Öl" wäre "CBD-Öl" != "cbd-öl"
 * ein falsches Match. Daher normalisieren wir in JS per
 * `toLocaleLowerCase('de')`.
 *
 * Bewusst dependency-frei (kein `db`-Import), damit auch der reine
 * Freitext-Parser (`lib/text_entries.ts`) dieselbe Normalisierung nutzen
 * kann, ohne die DB-Schicht zu laden. `lib/substances.ts` re-exportiert
 * `nameKey` von hier, damit bestehende Importe unverändert funktionieren.
 */
export function nameKey(name: string): string {
  return name.trim().toLocaleLowerCase('de');
}
