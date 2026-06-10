import { Router } from 'express';
import { z } from 'zod';
import { allDefaults, readDefaultsRaw, writeDefaultsRaw } from '../lib/defaults.js';

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
