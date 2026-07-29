import crypto from 'node:crypto';
import { z } from 'zod';
import { db } from '../db.js';
import {
  getSubstanceProfile,
  listSubstanceProfiles,
  upsertSubstanceProfile,
  type SubstanceProfileRow,
} from '../db.js';
import { nameKey } from './names.js';
import { defaultsFor } from './defaults.js';
import { generateText, anthropicAvailable, anthropicModel } from './anthropic.js';
import { config } from '../config.js';

/**
 * KI-Wirkstoff-Analyse für die Statistik „Wirkstoff-Bilanz".
 *
 * Idee: Die App soll den Gesamtkonsum eines Wirkstoffs (z. B. Koffein) über
 * ALLE Quellen hinweg aufsummieren können — Energy-Drink + Cola + Kaffee +
 * Koffeintablette. Der Modell-Call liefert dazu einmal pro Substanz ein
 * kompaktes „Rezept": wie viel eines Wirkstoffs in EINER üblichen Portion
 * steckt und wie eine Portion definiert ist (Volumen/Masse). Diese
 * Weltwissen-Schätzung wird gecacht (`substance_profiles`); die eigentliche
 * Hochrechnung auf die tatsächlich protokollierte Menge macht deterministisch
 * der Client (siehe web/src/lib/analytics.ts → applyProfile).
 *
 * Der Schlüssel wird ausschließlich serverseitig verwendet; ohne
 * ANTHROPIC_API_KEY liefert die Route 503. Modell/Endpunkt = dieselbe
 * Anthropic-(kompatible) Integration wie das KI-Tagebuch (config.anthropic),
 * läuft also auch gegen ein MiniMax-Abo.
 */

// ───────────────────────── Typen ─────────────────────────

export interface SubstanceServing {
  /** Menschlich lesbar, z. B. "1 Dose (250 ml)". */
  label: string;
  /** Zahl der typischen Portion in der Einheit `unit` (Default 1). */
  value: number;
  /** Einheit, wie der Nutzer sie protokolliert ("dose", "ml", "tablette", "mg", …). */
  unit: string;
  /** Volumen EINER Portion in ml (für Getränke) — erlaubt ml-Umrechnung. */
  milliliters?: number | null;
  /** Masse EINER Portion in g (für Feststoffe) — erlaubt g/mg-Umrechnung. */
  grams?: number | null;
}

export interface IngredientEntry {
  /** Kanonischer, kleingeschriebener Schlüssel (quellenübergreifend gleich): "caffeine". */
  compound: string;
  /** Deutscher Anzeigename: "Koffein". */
  label: string;
  /** Grobkategorie (stimulant, alcohol, sugar, medication, …). */
  category: string;
  /** Milligramm dieses Stoffes in EINER Portion. */
  mgPerServing: number;
}

export interface SubstanceProfile {
  serving: SubstanceServing;
  ingredients: IngredientEntry[];
  summary: string;
  confidence: 'low' | 'medium' | 'high';
}

/** Was das Modell über eine Substanz bekommt (Analyse-Eingabe). */
export interface SubstanceInput {
  name: string;
  key: string;
  defaultAmount: string | null;
  note: string | null;
  unit: string | null;
  /** Beobachtete (Menge · Notiz)-Beispiele aus den Einnahmen. */
  examples: string[];
  intakeCount: number;
}

// ───────────────────────── Eingabe sammeln ─────────────────────────

/**
 * Sammelt je Substanz (mit ≥ 1 Einnahme) die Analyse-Eingabe: Name,
 * DEFAULTS-Standardmenge/-Notiz, Substanz-Einheit und ein paar tatsächlich
 * beobachtete (Menge · Notiz)-Beispiele. Dedupliziert umlaut-bewusst über
 * `nameKey` (die häufigste Schreibweise gewinnt als Anzeigename).
 */
export function gatherSubstanceInputs(): SubstanceInput[] {
  const rows = db
    .prepare(`SELECT substance_name AS name, COUNT(*) AS c FROM intakes GROUP BY substance_name`)
    .all() as { name: string; c: number }[];

  // Umlaut-bewusst über nameKey zusammenführen: Gesamtzahl aller Schreibweisen,
  // Anzeigename = die häufigste einzelne Schreibweise.
  const byKey = new Map<string, { name: string; count: number; bestNameCount: number }>();
  for (const r of rows) {
    const key = nameKey(r.name);
    if (!key) continue;
    const cur = byKey.get(key);
    if (!cur) {
      byKey.set(key, { name: r.name, count: r.c, bestNameCount: r.c });
    } else {
      cur.count += r.c;
      if (r.c > cur.bestNameCount) {
        cur.name = r.name;
        cur.bestNameCount = r.c;
      }
    }
  }

  const unitOf = new Map(
    (db.prepare(`SELECT name, unit FROM substances`).all() as { name: string; unit: string | null }[]).map((s) => [
      nameKey(s.name),
      s.unit,
    ]),
  );

  const exampleStmt = db.prepare(
    `SELECT amount, notes, COUNT(*) AS c
       FROM intakes WHERE substance_name = @name
      GROUP BY amount, notes ORDER BY c DESC LIMIT 6`,
  );

  const out: SubstanceInput[] = [];
  for (const [key, v] of byKey) {
    const def = defaultsFor(v.name);
    const rawExamples = exampleStmt.all({ name: v.name }) as {
      amount: string | null;
      notes: string | null;
      c: number;
    }[];
    const examples = rawExamples
      .map((e) => {
        const amt = e.amount?.trim() || '—';
        const note = e.notes?.trim() ? ` · „${truncate(e.notes.trim(), 60)}"` : '';
        return `${amt}${note}`;
      })
      // Standardmenge/-Notiz sind schon separat drin → nicht doppelt zeigen
      .slice(0, 5);
    out.push({
      name: v.name,
      key,
      defaultAmount: def.amount,
      note: def.note ? truncate(def.note, 200) : null,
      unit: unitOf.get(key) ?? null,
      examples,
      intakeCount: v.count,
    });
  }
  // Häufigste zuerst — bei Chunking/Teilanalysen sind die relevantesten vorn.
  return out.sort((a, b) => b.intakeCount - a.intakeCount || a.name.localeCompare(b.name, 'de'));
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

/** Stabiler Hash der Analyse-Eingabe → „stale"-Erkennung bei Eingabe-Änderung. */
export function inputHash(input: SubstanceInput): string {
  const payload = JSON.stringify({
    name: input.name,
    defaultAmount: input.defaultAmount,
    note: input.note,
    unit: input.unit,
    examples: [...input.examples].sort(),
  });
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 16);
}

// ───────────────────────── Prompt ─────────────────────────

const SYSTEM_PROMPT = `Du bist ein pharmakologischer und ernährungswissenschaftlicher Analyst. Aufgabe: Für jede genannte Substanz (Getränk, Medikament, Nahrungsergänzung, Genussmittel, Droge …) die typischen, gut belegten Wirkstoff-/Inhaltsstoff-Gehalte PRO ÜBLICHER PORTION schätzen — damit eine App den Gesamtkonsum eines Wirkstoffs (z. B. Koffein) über ALLE Quellen hinweg zusammenrechnen kann.

Antworte AUSSCHLIESSLICH mit einem JSON-Array (kein Fließtext, keine Markdown-Codefences). Ein Objekt pro Eingabe-Substanz, Feld "name" EXAKT wie in der Eingabe. Schema je Objekt:
{
  "name": string,
  "serving": {
    "label": string,          // z. B. "1 Dose (250 ml)"
    "value": number,          // Zahl der typischen Portion in der Einheit unten (Default 1)
    "unit": string,           // Einheit, WIE DER NUTZER SIE PROTOKOLLIERT — bevorzugt die der Standardmenge ("dose","ml","tablette","mg","tasse","glas",…)
    "milliliters": number|null,// Volumen EINER Portion in ml (Getränke) — sonst null
    "grams": number|null       // Masse EINER Portion in g (Feststoffe) — sonst null
  },
  "ingredients": [
    { "compound": string, "label": string, "category": string, "mgPerServing": number }
  ],
  "summary": string,          // ein knapper deutscher Satz
  "confidence": "low"|"medium"|"high"
}

Regeln:
- "compound": kanonischer, KLEINGESCHRIEBENER englischer Schlüssel, damit gleiche Stoffe quellenübergreifend zusammenfallen. Häufige Schlüssel: caffeine, alcohol, sugar, nicotine, thc, cbd, taurine, theanine, paracetamol, ibuprofen, vitamin_c. Für Medikamente den Wirkstoff (INN) kleingeschrieben, z. B. quetiapine, pregabalin, sertraline.
- "label": deutscher Anzeigename (Koffein, Alkohol, Zucker, Nikotin, THC, CBD …).
- "category" aus: stimulant, depressant, cannabinoid, analgesic, alcohol, nicotine, sugar, nutrient, medication, other.
- "mgPerServing": Milligramm des Stoffes in EINER Portion. Alkohol als Masse reinen Ethanols in mg (0,5 l Bier 5 % ≈ 20 000 mg). Zucker ebenfalls in mg (1 Würfel ≈ 3 000 mg).
- Nur NENNENSWERTE, gut etablierte Stoffe listen. Kein quantifizierbarer Stoff (z. B. Wasser) → "ingredients": [].
- TYPISCHE Werte schätzen, keine falsche Präzision. Unsicher → "confidence":"low".
- Menge/Notiz/Beispiele nutzen, um Produkt & Portionsgröße zu erkennen (Notiz „Red Bull" → Energy-Drink 250 ml, ~80 mg Koffein).

Beispiel-Ausgabe (nur Format):
[{"name":"Energy Drink","serving":{"label":"1 Dose (250 ml)","value":1,"unit":"dose","milliliters":250,"grams":null},"ingredients":[{"compound":"caffeine","label":"Koffein","category":"stimulant","mgPerServing":80},{"compound":"sugar","label":"Zucker","category":"sugar","mgPerServing":27000},{"compound":"taurine","label":"Taurin","category":"other","mgPerServing":1000}],"summary":"Koffeinhaltiger Energy-Drink, Standarddose 250 ml.","confidence":"high"},{"name":"Cola","serving":{"label":"1 Glas (330 ml)","value":330,"unit":"ml","milliliters":330,"grams":null},"ingredients":[{"compound":"caffeine","label":"Koffein","category":"stimulant","mgPerServing":32},{"compound":"sugar","label":"Zucker","category":"sugar","mgPerServing":35000}],"summary":"Cola-Softdrink mit Koffein und Zucker.","confidence":"high"}]`;

function buildUserPrompt(inputs: SubstanceInput[]): string {
  const lines = inputs.map((s, i) => {
    const parts = [`${i + 1}. "${s.name}"`];
    parts.push(`Standardmenge: ${s.defaultAmount ?? '—'}`);
    if (s.unit) parts.push(`Einheit: ${s.unit}`);
    if (s.note) parts.push(`Notiz: „${s.note}"`);
    if (s.examples.length) parts.push(`Beispiele: [${s.examples.join(' | ')}]`);
    return parts.join(' — ');
  });
  return (
    `Analysiere diese ${inputs.length} Substanzen. „Standardmenge" ist die typische protokollierte Menge; ` +
    `richte "serving.unit" bevorzugt danach aus.\n\n${lines.join('\n')}\n\n` +
    `Antworte nur mit dem JSON-Array (ein Objekt je Substanz, "name" exakt übernehmen).`
  );
}

// ───────────────────────── Parsing/Validierung ─────────────────────────

const servingSchema = z.object({
  label: z.string().catch(''),
  value: z.coerce.number().positive().catch(1),
  unit: z.string().catch(''),
  milliliters: z.coerce.number().positive().nullish().catch(null),
  grams: z.coerce.number().positive().nullish().catch(null),
});

const ingredientSchema = z.object({
  compound: z.string().min(1),
  label: z.string().min(1),
  category: z.string().catch('other'),
  mgPerServing: z.coerce.number().nonnegative(),
});

const entrySchema = z.object({
  name: z.string().min(1),
  serving: servingSchema,
  ingredients: z.array(ingredientSchema).catch([]),
  summary: z.string().catch(''),
  confidence: z.enum(['low', 'medium', 'high']).catch('medium'),
});

/** Wirkstoff-Schlüssel kanonisieren: klein, getrimmt, Leer-/Bindestriche → "_". */
export function canonicalCompound(raw: string): string {
  return raw
    .trim()
    .toLocaleLowerCase('de')
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_äöü]/g, '');
}

/** Extrahiert das JSON-Array aus der Modell-Antwort (tolerant ggü. Codefences/Prosa). */
function extractJsonArray(text: string): unknown {
  let t = text.trim();
  // ```json … ``` oder ``` … ``` entfernen
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  // Vom ersten '[' bis zum letzten ']' schneiden (falls Prosa drum herum steht).
  const start = t.indexOf('[');
  const end = t.lastIndexOf(']');
  if (start >= 0 && end > start) t = t.slice(start, end + 1);
  return JSON.parse(t);
}

export interface ParsedEntry {
  key: string;
  name: string;
  profile: SubstanceProfile;
}

/**
 * Parst + validiert die Modell-Antwort in Profile. Unbrauchbare Einträge
 * werden übersprungen (nicht die ganze Antwort verworfen). `expected` bindet
 * jeden Eintrag per nameKey an eine Eingabe-Substanz (unbekannte Namen werden
 * ignoriert).
 */
export function parseProfiles(text: string, expected: Map<string, string>): ParsedEntry[] {
  const arr = extractJsonArray(text);
  if (!Array.isArray(arr)) throw new Error('Antwort ist kein JSON-Array.');
  const out: ParsedEntry[] = [];
  const seen = new Set<string>();
  for (const raw of arr) {
    const parsed = entrySchema.safeParse(raw);
    if (!parsed.success) continue;
    const key = nameKey(parsed.data.name);
    if (!expected.has(key) || seen.has(key)) continue;
    seen.add(key);
    const ingredients: IngredientEntry[] = parsed.data.ingredients
      .map((ing) => ({
        compound: canonicalCompound(ing.compound),
        label: ing.label.trim(),
        category: ing.category.trim() || 'other',
        mgPerServing: ing.mgPerServing,
      }))
      .filter((ing) => ing.compound && ing.mgPerServing > 0);
    out.push({
      key,
      name: expected.get(key)!, // kanonischer Anzeigename aus der Eingabe
      profile: {
        serving: {
          label: parsed.data.serving.label,
          value: parsed.data.serving.value,
          unit: parsed.data.serving.unit,
          milliliters: parsed.data.serving.milliliters ?? null,
          grams: parsed.data.serving.grams ?? null,
        },
        ingredients,
        summary: parsed.data.summary,
        confidence: parsed.data.confidence,
      },
    });
  }
  return out;
}

// ───────────────────────── Analyse-Lauf ─────────────────────────

export function ingredientsAvailable(): boolean {
  return anthropicAvailable();
}
export function ingredientsModel(): string {
  return anthropicModel();
}

const CHUNK_SIZE = 25;

export interface AnalyzeResult {
  analyzed: number;
  skipped: number;
  total: number;
  errors: { names: string[]; error: string }[];
}

/**
 * Analysiert Substanzen und cached die Profile. `scope='missing'` (Default)
 * nur die ohne frisches Profil (kein Cache ODER Eingabe-Hash abweichend);
 * `scope='all'` alle neu. In Chunks à CHUNK_SIZE, damit der Prompt nicht zu
 * groß wird; ein fehlgeschlagener Chunk stoppt die übrigen nicht.
 */
export async function analyzeSubstances(opts: { scope?: 'missing' | 'all' } = {}): Promise<AnalyzeResult> {
  if (!anthropicAvailable()) throw new Error('ANTHROPIC_API_KEY ist nicht konfiguriert.');
  const scope = opts.scope ?? 'missing';
  const inputs = gatherSubstanceInputs();

  const todo = scope === 'all' ? inputs : inputs.filter((s) => needsAnalysis(s));
  const errors: { names: string[]; error: string }[] = [];
  let analyzed = 0;

  const model = anthropicModel();
  for (let i = 0; i < todo.length; i += CHUNK_SIZE) {
    const chunk = todo.slice(i, i + CHUNK_SIZE);
    const expected = new Map(chunk.map((s) => [s.key, s.name]));
    try {
      const text = await generateText({
        system: SYSTEM_PROMPT,
        prompt: buildUserPrompt(chunk),
        maxTokens: config.anthropic.maxTokens,
      });
      const parsed = parseProfiles(text, expected);
      const hashByKey = new Map(chunk.map((s) => [s.key, inputHash(s)]));
      for (const p of parsed) {
        upsertSubstanceProfile({
          key: p.key,
          name: p.name,
          inputHash: hashByKey.get(p.key) ?? '',
          profile: JSON.stringify(p.profile),
          model,
        });
        analyzed++;
      }
    } catch (e) {
      errors.push({ names: chunk.map((s) => s.name), error: (e as Error).message });
    }
  }

  return { analyzed, skipped: todo.length - analyzed, total: inputs.length, errors };
}

/** True, wenn eine Substanz (noch) kein frisches Profil hat. */
function needsAnalysis(input: SubstanceInput): boolean {
  const row = getSubstanceProfile(input.key);
  if (!row) return true;
  return row.input_hash !== inputHash(input);
}

// ───────────────────────── Zustand (für GET) ─────────────────────────

export interface ProfileDTO {
  name: string;
  profile: SubstanceProfile;
  model: string;
  updatedAt: string;
  /** True, wenn die aktuelle Eingabe vom gecachten Hash abweicht. */
  stale: boolean;
}

export interface IngredientsState {
  available: boolean;
  model: string;
  /** Profile per nameKey. */
  profiles: Record<string, ProfileDTO>;
  /** Substanzen (mit Einnahmen) OHNE Profil. */
  missing: string[];
  /** Substanzen, deren Profil veraltet ist (Eingabe geändert). */
  stale: string[];
  /** Substanzen gesamt (mit ≥ 1 Einnahme). */
  total: number;
}

function safeParseProfile(row: SubstanceProfileRow): SubstanceProfile | null {
  try {
    return JSON.parse(row.profile) as SubstanceProfile;
  } catch {
    return null;
  }
}

/** Aktueller Analyse-Zustand: was ist gecacht, was fehlt, was ist veraltet. */
export function ingredientsState(): IngredientsState {
  const inputs = gatherSubstanceInputs();
  const rows = new Map(listSubstanceProfiles().map((r) => [r.substance_key, r]));
  const profiles: Record<string, ProfileDTO> = {};
  const missing: string[] = [];
  const stale: string[] = [];

  for (const input of inputs) {
    const row = rows.get(input.key);
    if (!row) {
      missing.push(input.name);
      continue;
    }
    const profile = safeParseProfile(row);
    if (!profile) {
      missing.push(input.name);
      continue;
    }
    const isStale = row.input_hash !== inputHash(input);
    if (isStale) stale.push(input.name);
    profiles[input.key] = {
      name: input.name, // aktueller Anzeigename
      profile,
      model: row.model,
      updatedAt: row.updated_at,
      stale: isStale,
    };
  }

  return {
    available: anthropicAvailable(),
    model: anthropicModel(),
    profiles,
    missing,
    stale,
    total: inputs.length,
  };
}
