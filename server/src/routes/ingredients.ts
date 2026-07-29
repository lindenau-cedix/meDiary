import { Router } from 'express';
import { z } from 'zod';
import { requireCloudflareAccess } from '../lib/cloudflare_access.js';
import { analyzeSubstances, ingredientsState, ingredientsAvailable } from '../lib/ingredients.js';

export const ingredientsRouter = Router();

/**
 * Ingredient profiles (AI) for the "Active-ingredient balance" statistics view.
 *
 * GET  /api/ingredients          — open read: cached profiles + what's missing/stale.
 * POST /api/ingredients/analyze  — protected (Cloudflare Access) + LLM cost:
 *                                  analyses missing (or all) substances and caches them.
 */

/** Current state: profiles, missing/stale substances, key present? */
ingredientsRouter.get('/', (_req, res) => {
  res.json(ingredientsState());
});

const analyzeSchema = z.object({
  scope: z.enum(['missing', 'all']).optional(),
});

// Simple in-process lock: prevents parallel (costly) analysis runs.
let analyzing = false;

/**
 * Analyses substances via AI and caches the ingredient profiles. 503 without
 * ANTHROPIC_API_KEY, 409 if a run is already active. `scope` (default
 * 'missing') = only substances without a fresh profile; 'all' = all again.
 */
ingredientsRouter.post('/analyze', requireCloudflareAccess, async (req, res) => {
  if (!ingredientsAvailable()) {
    return res.status(503).json({
      error:
        'AI ingredient analysis is not configured. Set MINIMAX_API_KEY (uses the MiniMax subscription like the data console) — or INGREDIENTS_API_KEY/INGREDIENTS_MODEL for a custom configuration.',
    });
  }
  const parsed = analyzeSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  if (analyzing) {
    return res.status(409).json({ error: 'An analysis is already running. Please wait.' });
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
