import { Router } from 'express';
import { z } from 'zod';
import { requireCloudflareAccess } from '../lib/cloudflare_access.js';
import { analyzeSubstances, ingredientsState, ingredientsAvailable } from '../lib/ingredients.js';

export const ingredientsRouter = Router();

/**
 * Wirkstoff-Profile (KI) für die Statistik „Wirkstoff-Bilanz".
 *
 * GET  /api/ingredients          — offener Read: gecachte Profile + was fehlt/veraltet ist.
 * POST /api/ingredients/analyze  — geschützt (Cloudflare Access) + LLM-Kosten:
 *                                  analysiert fehlende (oder alle) Substanzen und cached sie.
 */

/** Aktueller Zustand: Profile, fehlende/veraltete Substanzen, Key vorhanden? */
ingredientsRouter.get('/', (_req, res) => {
  res.json(ingredientsState());
});

const analyzeSchema = z.object({
  scope: z.enum(['missing', 'all']).optional(),
});

// Einfacher In-Process-Lock: verhindert parallele (teure) Analyse-Läufe.
let analyzing = false;

/**
 * Analysiert Substanzen via KI und cached die Wirkstoff-Profile. 503 ohne
 * ANTHROPIC_API_KEY, 409 wenn bereits ein Lauf aktiv ist. `scope` (Default
 * 'missing') = nur Substanzen ohne frisches Profil; 'all' = alle neu.
 */
ingredientsRouter.post('/analyze', requireCloudflareAccess, async (req, res) => {
  if (!ingredientsAvailable()) {
    return res.status(503).json({
      error:
        'KI-Wirkstoff-Analyse ist nicht konfiguriert. Setze ANTHROPIC_API_KEY (und optional DIARY_MODEL) in der .env.',
    });
  }
  const parsed = analyzeSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  if (analyzing) {
    return res.status(409).json({ error: 'Eine Analyse läuft bereits. Bitte warten.' });
  }
  analyzing = true;
  try {
    const result = await analyzeSubstances(parsed.data);
    res.json({ ...result, state: ingredientsState() });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  } finally {
    analyzing = false;
  }
});
