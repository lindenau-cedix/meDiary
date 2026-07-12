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
 * „Träume" = die täglichen KI-Auswertungen (system_prompt.md → MiniMax M3).
 * Lese-Endpunkte sind offen (privates Deployment, wie der Rest der API); der
 * Generieren-Trigger ist geschützt: primär per `X-Dream-Token` (konstantzeit
 * verglichen), Loopback nur als bewusster Opt-in (DREAM_TRUST_LOOPBACK) für
 * Nur-lokal-Deployments — siehe Hinweise an `isLoopback`/`config.dream`.
 */

/** Zeitpunkt der letzten Generierung über den HTTP-Trigger (einfacher Rate-Limit). */
let lastGenerateAt = 0;

/** Liste der Träume (neueste zuerst). `?from=&to=&limit=`. */
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

/** Jüngster Traum (für den Startup-Dialog). 200 mit exists=false, wenn keiner. */
dreamsRouter.get('/latest', (_req, res) => {
  const row = latestDream();
  if (!row) return res.json({ exists: false, available: dreamAvailable() });
  res.json({ ...serializeDream(row), exists: true, available: dreamAvailable() });
});

const generateSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date muss YYYY-MM-DD sein')
    .optional(),
  force: z.boolean().optional(),
});

/** Konstantzeit-Vergleich (längen-sicher) für das Trigger-Token (CWE-208). */
function tokenMatches(provided: string | undefined, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Echtes localhost? Liest BEWUSST `req.socket.remoteAddress` statt `req.ip` —
 * immun gegen ein späteres `app.set('trust proxy', …)`, das `req.ip` aus dem
 * angreifer-kontrollierbaren `X-Forwarded-For` ableiten würde.
 *
 * ACHTUNG: Hinter einem Same-Host-Reverse-Proxy / cloudflared-Tunnel kommt
 * JEDE externe Anfrage über 127.0.0.1 herein — dort ist Loopback KEINE Auth.
 * Darum greift dieser Pfad nur, wenn `DREAM_TRUST_LOOPBACK=true` explizit
 * gesetzt ist (Default: aus → Token ist Pflicht). 'trust proxy' muss aus bleiben.
 */
function isLoopback(req: Request): boolean {
  const ip = req.socket.remoteAddress || '';
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip.startsWith('127.');
}

/**
 * Manueller Trigger (für Tests / Cron). Body `{ date?, force? }`.
 * Schutz (fail-closed): gültiger `X-Dream-Token`-Header (Pflicht, sofern kein
 * vertrauenswürdiges Loopback). Loopback zählt nur mit `DREAM_TRUST_LOOPBACK=
 * true` (reine Nur-lokal-Deployments ohne Proxy/Tunnel davor). Ohne beides → 403.
 */
dreamsRouter.post('/generate', async (req, res) => {
  const token = config.dream.triggerToken;
  const tokenOk = token != null && tokenMatches(req.header('x-dream-token'), token);
  const loopbackOk = config.dream.trustLoopback && isLoopback(req);
  if (!tokenOk && !loopbackOk) {
    return res.status(403).json({
      error: token
        ? 'Nicht autorisiert: gültigen X-Dream-Token-Header senden.'
        : 'Nicht autorisiert: DREAM_TRIGGER_TOKEN setzen (oder DREAM_TRUST_LOOPBACK=true für reine Nur-lokal-Deployments ohne Proxy/Tunnel).',
    });
  }

  if (!dreamAvailable()) {
    return res.status(503).json({
      error: 'Nächtliches Träumen ist nicht konfiguriert. Setze MINIMAX_API_KEY in der .env.',
    });
  }

  const parsed = generateSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  // Einfacher Rate-Limit gegen Token-Kosten-Missbrauch (generate→DELETE→generate).
  const minInterval = config.dream.minIntervalMs;
  if (minInterval > 0) {
    const since = Date.now() - lastGenerateAt;
    if (since < minInterval) {
      return res.status(429).json({
        error: `Zu viele Anfragen — mindestens ${Math.ceil(minInterval / 1000)}s Abstand zwischen Generierungen.`,
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

/** Einzelner Traum. 200 mit exists=false, wenn keiner. */
dreamsRouter.get('/:date', (req, res) => {
  const date = req.params.date.slice(0, 10);
  const row = dreamFor(date);
  if (!row) return res.json({ date, exists: false });
  res.json({ ...serializeDream(row), exists: true });
});

/** Traum löschen (z. B. um neu generieren zu lassen). 204 / 404. */
dreamsRouter.delete('/:date', (req, res) => {
  const date = req.params.date.slice(0, 10);
  if (!deleteDream(date)) return res.status(404).json({ error: 'Kein Traum für diesen Tag' });
  res.status(204).end();
});

/**
 * Vorhandenen Traum erneut zustellen (admin). Body: `{}` (kein Body nötig).
 * Idempotent: bereits `status='sent'`-Zeilen werden NICHT erneut gesendet
 * (siehe `deliverDream` in `lib/dream_delivery.ts`).
 */
dreamsRouter.post('/:date/redeliver', requireCloudflareAccess, async (req, res) => {
  const dream = dreamFor(req.params.date);
  if (!dream) {
    res.status(404).json({ error: 'dream nicht gefunden' });
    return;
  }
  // Lazy-Import, damit der Modul-Init unabhängig von der Delivery-Pipeline
  // bleibt (kein zirkulärer Load, kein WhatsApp-Side-Effect beim Import).
  const { enqueueDelivery } = await import('../lib/dream_delivery.js');
  const result = await enqueueDelivery(dream);
  res.json({ ...result, date: dream.date });
});
