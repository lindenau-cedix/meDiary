/**
 * Dosis-/Mengen-Normalisierung für den *Vergleich* (nicht für die Anzeige).
 *
 * Server-Spiegel von `doseKey()` in `web/src/lib/plan.ts` — beide MÜSSEN
 * identisch normalisieren, damit die „planmäßig"-Erkennung im Frontend und die
 * dosis-bewusste Nacht-Medikations-Vollständigkeit hier serverseitig dieselbe
 * Antwort geben. Analog zum `nameKey()`-Mirror (`server/src/lib/names.ts` ↔
 * `web/src/lib/names.ts`).
 *
 * Tolerant gegenüber Whitespace, Groß-/Kleinschreibung und Einheiten-Abstand:
 * "150mg" == "150 mg" == "150 MG". Dezimal-Komma wird zu Punkt vereinheitlicht
 * ("0,5" → "0.5"), ein abschließender Punkt fällt weg. Leerer/Null-Wert → ""
 * (matcht nie eine konkrete Plan-Dosis).
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
