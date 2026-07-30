/**
 * Substance-name normalisation. Unicode-aware because SQLite `lower()` is
 * ASCII-only and sorts umlauts incorrectly (see CLAUDE.md / `nameKey()` on
 * the server).
 *
 * The `'de'` argument to `toLocaleLowerCase` is a data invariant — it
 * keeps the locale-specific casing rules identical to the server, so
 * client-side matches line up with server-side ones. Do not translate it.
 */
export function nameKey(name: string): string {
  return name.trim().toLocaleLowerCase('de');
}
