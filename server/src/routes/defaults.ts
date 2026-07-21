import { Router } from 'express';
import { z } from 'zod';
import { requireCloudflareAccess } from '../lib/cloudflare_access.js';
import {
  allDefaults,
  readDefaultsRaw,
  writeDefaultsRaw,
  complianceReport,
  parseSections,
  buildMarkdownFromParsed,
  validateSections,
  type SectionInput,
} from '../lib/defaults.js';

export const defaultsRouter = Router();

/** Standard-Notizen pro Substanz – geparst und als Rohtext. */
defaultsRouter.get('/', (_req, res) => {
  res.json({ defaults: allDefaults(), raw: readDefaultsRaw() });
});

/** DEFAULTS.md überschreiben (Bearbeitung aus den Einstellungen heraus). */
defaultsRouter.put('/', (req, res) => {
  const parsed = z.object({ content: z.string() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  writeDefaultsRaw(parsed.data.content);
  res.json({ defaults: allDefaults(), raw: readDefaultsRaw() });
});

/**
 * Strukturierte Sections anlegen / ersetzen. Frontend schickt pro
 * Substanz einen Eintrag (name + amount? + note? + Mit:-Liste +
 * optionale pre/post-Zeilen für NACH:…-Kommentarblöcke). Wir
 * validieren, serialisieren zurück in Markdown und schreiben.
 *
 * Gated mit `requireCloudflareAccess` (entspricht `POST /api/intakes/text`
 * und `/api/whatsapp/*` — siehe docs/api.md).
 */
const CompanionSchema = z.object({
  name: z.string(),
  amount: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
});
const SectionSchema = z.object({
  name: z.string(),
  amount: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  companions: z.array(CompanionSchema).default([]),
  preLines: z.array(z.string()).default([]),
  postLines: z.array(z.string()).default([]),
});
const SectionsPayloadSchema = z.object({
  sections: z.array(SectionSchema),
});

defaultsRouter.put('/sections', requireCloudflareAccess, (req, res) => {
  const parsed = SectionsPayloadSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  // zod optional → explizit null-normalisieren für serializeSections
  const sections: SectionInput[] = parsed.data.sections.map((s) => ({
    name: s.name,
    amount: s.amount ?? null,
    note: s.note ?? null,
    companions: s.companions.map((c) => ({
      name: c.name,
      amount: c.amount ?? null,
      note: c.note ?? null,
    })),
    preLines: s.preLines,
    postLines: s.postLines,
  }));
  const verdict = validateSections(sections);
  if (!verdict.ok) return res.status(400).json({ error: verdict.error });

  // Wir lesen die aktuelle Datei nochmal frisch ein, damit Preamble und
  // Epilogue (Dokumenttitel, trailing Kommentare) erhalten bleiben — nur
  // die Sektionen werden durch die Eingabe ersetzt. Nicht im Payload
  // aufgeführte Sektionen werden ebenfalls entfernt (die UI sendet die
  // vollständige Liste).
  const current = parseSections(readDefaultsRaw());
  const md = buildMarkdownFromParsed({ ...current, sections });
  writeDefaultsRaw(md);
  res.json({ defaults: allDefaults(), raw: readDefaultsRaw() });
});

/**
 * Compliance-Check: prüft, ob jede Substanz (in `substances` oder in
 * `intakes`) einen passenden Eintrag in DEFAULTS.md hat. Liefert alle
 * Substanzen aufgeteilt in `compliant` (mit Default) und `missing` (ohne).
 */
defaultsRouter.get('/check', (_req, res) => {
  res.json(complianceReport());
});
