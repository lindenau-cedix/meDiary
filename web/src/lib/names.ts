/**
 * Substanz-Namens-Normalisierung. Unicode-aware, weil SQLite `lower()`
 * ASCII-only ist und Umlaute falsch sortiert (siehe CLAUDE.md /
 * `nameKey()` auf dem Server).
 */
export function nameKey(name: string): string {
  return name.trim().toLocaleLowerCase('de');
}
