import { Router, type Request } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { config } from '../config.js';
import { listDreams, latestDream, dreamFor, deleteDream } from '../db.js';
import { serializeDream } from '../lib/serialize.js';
import { generateDream, dreamAvailable, dreamTargetDate } from '../lib/dreams.js';
import { withDreamLock, DreamBusyError, dreamBusy } from '../lib/dream_scheduler.js';
import { MinimaxNotConfiguredError } from '../lib/minimax.js';
import { requireCloudflareAccess } from '../lib/cloudflare_access.js';

export const dreamsRouter = Router();

/**
 * "Dreams" = the daily AI evaluations (system_prompt.md → MiniMax M3).
 * Read endpoints are open (private deployment, like the rest of the API); the
 * generate trigger is protected: primarily via `X-Dream-Token` (compared in
 * constant time), loopback only as an explicit opt-in (DREAM_TRUST_LOOPBACK)
 * for local-only deployments — see the notes at `isLoopback`/`config.dream`.
 */

/** Timestamp of the last generation triggered via HTTP (simple rate limit). */
let lastGenerateAt = 0;

/** List of dreams (newest first). `?from=&to=&limit=`. */
dreamsRouter.get('/', (req, res) => {
  const from = typeof req.query.from === 'string' ? req.query.from : undefined;
  const to = typeof req.query.to === 'string' ? req.query.to : undefined;
  const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
  const dreams = listDreams({ from, to, limit: Number.isFinite(limit) ? limit : undefined }).map(serializeDream);
  res.json({
    dreams,
    available: dreamAvailable(),
    busy: dreamBusy(),
  });
});

/** Most recent dream (for the startup dialog). 200 with exists=false if none. */
dreamsRouter.get('/latest', (_req, res) => {
  const row = latestDream();
  if (!row) return res.json({ exists: false, available: dreamAvailable() });
  res.json({ ...serializeDream(row), exists: true, available: dreamAvailable() });
});

const generateSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD')
    .optional(),
  force: z.boolean().optional(),
});

/** Constant-time comparison (length-safe) for the trigger token (CWE-208). */
function tokenMatches(provided: string | undefined, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * True localhost? Deliberately reads `req.socket.remoteAddress` instead of
 * `req.ip` — immune to a later `app.set('trust proxy', …)` that would derive
 * `req.ip` from the attacker-controlled `X-Forwarded-For`.
 *
 * WARNING: behind a same-host reverse proxy / cloudflared tunnel, EVERY
 * external request arrives via 127.0.0.1 — there, loopback is NOT auth.
 * That is why this path only triggers when `DREAM_TRUST_LOOPBACK=true` is
 * explicitly set (default: off → token is required). 'trust proxy' must stay off.
 */
function isLoopback(req: Request): boolean {
  const ip = req.socket.remoteAddress || '';
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip.startsWith('127.');
}

/**
 * Manual trigger (for tests / cron). Body `{ date?, force? }`.
 * Protection (fail-closed): valid `X-Dream-Token` header (required unless a
 * trusted loopback). Loopback only counts with `DREAM_TRUST_LOOPBACK=true`
 * (purely local deployments without a proxy/tunnel in front). Without either → 403.
 */
dreamsRouter.post('/generate', async (req, res) => {
  const token = config.dream.triggerToken;
  const tokenOk = token != null && tokenMatches(req.header('x-dream-token'), token);
  const loopbackOk = config.dream.trustLoopback && isLoopback(req);
  if (!tokenOk && !loopbackOk) {
    return res.status(403).json({
      error: token
        ? 'Not authorized: send a valid X-Dream-Token header.'
        : 'Not authorized: set DREAM_TRIGGER_TOKEN (or DREAM_TRUST_LOOPBACK=true for purely local deployments without a proxy/tunnel).',
    });
  }

  if (!dreamAvailable()) {
    return res.status(503).json({
      error: 'Nightly dreaming is not configured. Set MINIMAX_API_KEY in the .env.',
    });
  }

  const parsed = generateSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  // Simple rate limit against token-cost abuse (generate→DELETE→generate).
  const minInterval = config.dream.minIntervalMs;
  if (minInterval > 0) {
    const since = Date.now() - lastGenerateAt;
    if (since < minInterval) {
      return res.status(429).json({
        error: `Too many requests — at least ${Math.ceil(minInterval / 1000)}s between generations.`,
        retryAfterMs: minInterval - since,
      });
    }
  }
  lastGenerateAt = Date.now();

  try {
    const result = await withDreamLock(() =>
      generateDream({ date: parsed.data.date, force: parsed.data.force }),
    );
    res.json({
      ...result,
      dream: result.dream ? serializeDream(result.dream) : null,
      targetDate: parsed.data.date ?? dreamTargetDate(),
    });
  } catch (e) {
    if (e instanceof DreamBusyError) return res.status(409).json({ error: e.message });
    if (e instanceof MinimaxNotConfiguredError) return res.status(503).json({ error: e.message });
    res.status(500).json({ error: (e as Error).message });
  }
});

/** Single dream. 200 with exists=false if none. */
dreamsRouter.get('/:date', (req, res) => {
  const date = req.params.date.slice(0, 10);
  const row = dreamFor(date);
  if (!row) return res.json({ date, exists: false });
  res.json({ ...serializeDream(row), exists: true });
});

/** Delete a dream (e.g. to trigger regeneration). 204 / 404. */
dreamsRouter.delete('/:date', (req, res) => {
  const date = req.params.date.slice(0, 10);
  if (!deleteDream(date)) return res.status(404).json({ error: 'No dream for this day' });
  res.status(204).end();
});

/**
 * Re-deliver an existing dream (admin). Body: `{}` (no body required).
 * Idempotent: rows already in `status='sent'` are NOT re-sent
 * (see `deliverDream` in `lib/dream_delivery.ts`).
 */
dreamsRouter.post('/:date/redeliver', requireCloudflareAccess, async (req, res) => {
  const dream = dreamFor(req.params.date);
  if (!dream) {
    res.status(404).json({ error: 'dream not found' });
    return;
  }
  // Lazy import so module init stays independent of the delivery pipeline
  // (no circular load, no WhatsApp side effect on import).
  const { enqueueDelivery } = await import('../lib/dream_delivery.js');
  const result = await enqueueDelivery(dream);
  res.json({ ...result, date: dream.date });
});
