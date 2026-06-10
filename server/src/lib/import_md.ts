/**
 * Parser für die kuratierten Markdown-Logs im `import/`-Ordner. Diese Dateien sind
 * die *sauberere* Quelle als `entries.jsonl` (exakte Uhrzeiten, klare Substanznamen,
 * Korrekturen bereits eingearbeitet):
 *
 *   medikations_akutverlauf.md      -> Akut-/Bedarfseinnahmen   (parseAkut)
 *   medikationsplan_verlauf.md      -> versionierter Plan        (parsePlanVerlauf)
 *
 * Planmäßige Einnahmen (Morgen-/Nachtmedikation) stehen strukturierter und
 * vollständiger in entries.jsonl (planned_intake) und werden dort gelesen; die
 * prosalastige medikations_einnahmeverlauf.md ist dazu redundant.
 *
 * Nur Dokumentation von Cedrics Angaben, keine medizinische Bewertung.
 */

// ---------------------------------------------------------------- Substanz/Dosis

// Mengeneinheiten; bewusst KEIN "%". Verhindert Treffer in Konzentrationen wie
// "32 mg/100 ml" oder "10 mg/ml" über den Lookahead (?!\s*/).
const UNIT = '(?:mg|ml|µg|ug|mcg|g|Pillen?|Kapseln?|Stück|Dosen?|Schluck|Tropfen)';
const DOSE_RE = new RegExp(
  `(?<![\\w/])(\\d+(?:[.,]\\d+)?(?:\\s*[–-]\\s*\\d+(?:[.,]\\d+)?)?)\\s*(${UNIT})\\b(?!\\s*/)`,
  'i',
);

// Wörter, an denen der Substanzname spätestens endet.
const NAME_CUT =
  /[,;(<]|\s[–-]\s| als | entsprechend| oral\b| nasal\b| intranasal\b| sublingual\b| akut\b| durch | auf | aus der| aus \b| getrunken| getrocknet| geraucht| inhaliert| eingenommen| dokumentiert| geschluckt| pro /i;

/** Zerlegt einen Freitext-Schnipsel in sauberen Substanznamen + Menge. */
export function extractSubstance(raw: string): { name: string; amount: string | null } {
  let s = String(raw).replace(/\*\*/g, '').trim();
  let amount: string | null = null;
  const m = s.match(DOSE_RE);
  if (m && m.index != null) {
    amount = `${m[1].replace(/\s+/g, '')} ${m[2]}`.replace(/(\d)\s+(\D)/, '$1 $2');
    amount = `${m[1].trim()} ${m[2]}`;
    s = (s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length)).replace(/\s+/g, ' ').trim();
  }
  let name = s.split(NAME_CUT)[0];
  name = name
    .replace(/\bca\.\s*/gi, '')
    .replace(/\bweiteres?\b/gi, '')
    .replace(/\bweitere\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(?:eine?n?|ein|der|die|das|noch|desselben|dasselbe)\s+/i, '')
    .replace(/[.,;:–-]+$/, '')
    .replace(/\s+(mit|und|oder|aus|von|bei|für)$/i, '')
    .trim();
  if (!name) name = s.replace(/[.,;:]+$/, '').trim() || 'Eintrag';
  if (name.length > 60) name = name.slice(0, 57).trim() + '…';
  return { name, amount };
}

// ---------------------------------------------------------------- Einnahmen

export interface MdIntake {
  takenAt: string; // YYYY-MM-DDThh:mm:ss (lokale Wanduhr)
  name: string;
  amount: string | null;
  notes: string;
  source: 'akut' | 'plan';
}

/** Akutverlauf: `## YYYY-MM-DD` + `- **[ca. ]HH:MM CEST…:** <Substanz Dosis>`. */
export function parseAkut(text: string): MdIntake[] {
  const out: MdIntake[] = [];
  let day: string | null = null;
  for (const lineRaw of text.split(/\r?\n/)) {
    const line = lineRaw.trim();
    const h = line.match(/^##\s+(\d{4}-\d{2}-\d{2})/);
    if (h) { day = h[1]; continue; }
    if (!day) continue;
    // Nur fettgedruckte Bullets, deren Label mit einer Uhrzeit beginnt → echte Einnahme.
    // ("- **Tagesstand …:**" o. ä. werden so übersprungen.)
    const b = line.match(/^[-*]\s*\*\*\s*(?:ca\.\s*)?(\d{1,2}:\d{2})[^*]*\*\*\s*(.*)$/);
    if (!b) continue;
    const time = b[1].padStart(5, '0');
    const rest = b[2].replace(/^[:,]\s*/, '').trim();
    if (!rest) continue;
    const { name, amount } = extractSubstance(rest);
    out.push({
      takenAt: `${day}T${time}:00`,
      name,
      amount,
      notes: line.replace(/^[-*]\s*/, '').replace(/\*\*/g, '').trim(),
      source: 'akut',
    });
  }
  return out;
}

// ---------------------------------------------------------------- Plan-Versionen

export interface MdPlanItem {
  substanceName: string;
  strength: string | null;
  morning: string | null;
  noon: string | null;
  evening: string | null;
  night: string | null;
  notes: string | null;
}
export interface MdPlanVersion {
  createdAt: string;
  note: string;
  items: MdPlanItem[];
}

type Slot = 'morning' | 'noon' | 'afternoon' | 'evening' | 'night';
const SLOTS: Slot[] = ['morning', 'noon', 'afternoon', 'evening', 'night'];
type State = Record<Slot, Map<string, { name: string; dose: string | null }>>;

function emptyState(): State {
  return { morning: new Map(), noon: new Map(), afternoon: new Map(), evening: new Map(), night: new Map() };
}
function cloneState(s: State): State {
  const c = emptyState();
  for (const slot of SLOTS) c[slot] = new Map(s[slot]);
  return c;
}

function slotOf(word: string): Slot | null {
  const w = word.toLowerCase();
  if (/^morgens?$/.test(w)) return 'morning';
  if (/^mittags?$/.test(w) || w === 'tagsüber') return 'noon';
  if (/^nachmittags?$/.test(w)) return 'afternoon';
  if (/^abends?$/.test(w)) return 'evening';
  if (/^nachts?$/.test(w) || w === 'zur nacht') return 'night';
  return null;
}

/** "500 mg Substitol, 72 mg Kinecteen und 20 mg Aripiprazol." → Map. */
function parseSlotValue(value: string): Map<string, { name: string; dose: string | null }> {
  const map = new Map<string, { name: string; dose: string | null }>();
  for (const chunk of value.split(/,|;|\+| und | sowie /i)) {
    const c = chunk.replace(/\.$/, '').trim();
    if (!c || /^(unverändert|wurde|wurden|wird|nichts|sofern|laut|gemäß|soweit)/i.test(c)) continue;
    const { name, amount } = extractSubstance(c);
    if (name.length < 2) continue;
    map.set(name.toLowerCase(), { name, dose: amount });
  }
  return map;
}

/** Findet im Abschnitt die maßgebliche Gruppe von Tagesabschnitts-Bullets (Snapshot). */
function chooseGroup(lines: string[]): { word: string; value: string }[] | null {
  interface G { intro: string; bullets: { word: string; value: string }[] }
  const groups: G[] = [];
  let lastIntro = '';
  let cur: G | null = null;
  for (const lineRaw of lines) {
    const line = lineRaw.trim();
    const bullet = line.match(/^[-*]\s*(Morgens?|Mittags?|Nachmittags?|Abends?|Nachts?|Zur Nacht|Tagsüber)\b\s*:?\s*(.*)$/i);
    if (bullet && slotOf(bullet[1])) {
      if (!cur) { cur = { intro: lastIntro, bullets: [] }; groups.push(cur); }
      cur.bullets.push({ word: bullet[1], value: bullet[2] });
    } else {
      cur = null;
      if (line) lastIntro = line;
    }
  }
  if (!groups.length) return null;
  const pick = (re: RegExp) => groups.find((g) => re.test(g.intro));
  const chosen =
    pick(/Fortlaufender Plan/i) ||
    pick(/Aktueller Plan laut Cedric(?!\s*\(ab)/i) ||
    pick(/^### Stand/i) ||
    groups[groups.length - 1];
  // Übergangstag-Gruppen ("… wurden eingenommen") nie als finalen Snapshot wählen,
  // außer es gibt keine Alternative.
  if (chosen.bullets.some((b) => /wurde|wurden|wird/i.test(b.value)) && groups.length > 1) {
    const alt = groups.find((g) => g !== chosen && !g.bullets.some((b) => /wurde|wurden|wird/i.test(b.value)));
    if (alt) return alt.bullets;
  }
  return chosen.bullets;
}

function buildItems(state: State): MdPlanItem[] {
  const bySub = new Map<string, MdPlanItem & { afternoon: string | null }>();
  for (const slot of SLOTS) {
    for (const [key, { name, dose }] of state[slot]) {
      const it =
        bySub.get(key) ??
        { substanceName: name, strength: null, morning: null, noon: null, afternoon: null, evening: null, night: null, notes: null };
      it.substanceName = name;
      (it as any)[slot] = dose ?? '✓';
      bySub.set(key, it);
    }
  }
  return [...bySub.values()].map(({ afternoon, ...it }) => ({
    ...it,
    notes: afternoon ? `Nachmittags: ${afternoon}` : null,
  }));
}

function removeFromAll(state: State, re: RegExp) {
  for (const slot of SLOTS) for (const key of [...state[slot].keys()]) if (re.test(key)) state[slot].delete(key);
}

function headingCreatedAt(heading: string): string {
  const dates = heading.match(/\d{4}-\d{2}-\d{2}/g) ?? [];
  const seit = heading.match(/(?:seit|ab|Stand)\s+(\d{4}-\d{2}-\d{2})/i);
  const date = seit?.[1] ?? dates[0] ?? '2026-01-01';
  if (/\bmorgens?\b/i.test(heading)) return `${date}T07:00:00`;
  if (/\bmittags?\b/i.test(heading)) return `${date}T12:00:00`;
  if (/\bnachmittags?\b/i.test(heading)) return `${date}T15:00:00`;
  if (/\babends?\b/i.test(heading)) return `${date}T18:00:00`;
  if (/zur Nacht|\bnachts?\b/i.test(heading)) return `${date}T22:00:00`;
  const doc = heading.match(/dokumentiert[^0-9]*\d{4}-\d{2}-\d{2}\s+(\d{2}:\d{2})/i) || heading.match(/dokumentiert.*?(\d{2}:\d{2})/i);
  return `${date}T${doc?.[1] ?? '00:00'}:00`;
}

/** Plan-Verlauf → chronologische Snapshots. Mischung aus Voll-Snapshots und Deltas. */
export function parsePlanVerlauf(text: string): MdPlanVersion[] {
  const sections = text.split(/^###\s+/m).slice(1); // erstes Stück ist Doku-Kopf
  const versions: MdPlanVersion[] = [];
  let state = emptyState();
  for (const sec of sections) {
    const lines = sec.split(/\r?\n/);
    const heading = lines[0].trim();
    const body = lines.slice(1);
    let isVersion = false;

    const group = chooseGroup(body);
    if (group) {
      state = emptyState();
      for (const { word, value } of group) {
        const slot = slotOf(word);
        if (slot) state[slot] = parseSlotValue(value);
      }
      isVersion = true;
    } else {
      // Delta-Abschnitte
      for (const lineRaw of body) {
        const nm = lineRaw.match(/Nachtmedikation\b.*:\s*(\d.*Mirtazapin.*)$/i);
        if (nm) { state.night = parseSlotValue(nm[1]); isVersion = true; }
        const mph = lineRaw.match(/Methylphenidat.*?:\s*ab jetzt\s*([\d.,]+\s*mg)/i);
        if (mph) {
          for (const [key, v] of state.morning) {
            if (/kinecteen|methylphenidat/i.test(key)) state.morning.set(key, { name: v.name, dose: `${mph[1].trim()}` });
          }
          isVersion = true;
        }
      }
      if (/Trazodon\b[^\n]*abgesetzt/i.test(sec)) { removeFromAll(state, /trazodon/i); isVersion = true; }
      if (/Gabapentin\b[^\n]*nicht mehr als täglich/i.test(sec)) { removeFromAll(state, /gabapentin/i); isVersion = true; }
    }

    if (!isVersion) continue;
    const changed = sec.match(/Geändert gegenüber vorherigem Stand:\s*([^\n]+)/i);
    const note = (`${heading}${changed ? ' — ' + changed[1].trim() : ''}`).replace(/\s+/g, ' ').slice(0, 240);
    versions.push({ createdAt: headingCreatedAt(heading), note, items: buildItems(state) });
  }
  versions.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
  return versions;
}
