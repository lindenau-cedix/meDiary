import { Router, type Request, type Response } from 'express';
import * as whatsapp from '../lib/whatsapp.js';
import { config } from '../config.js';
import { requireCloudflareAccess } from '../lib/cloudflare_access.js';
import { listDeliveryTargets, insertDeliveryTarget } from '../db.js';

/**
 * WhatsApp management — status & pairing helpers (admin-protected) +
 * recipient list (read open, write admin). The pairing QR is only useful
 * while no session exists; a 404 with a clear error message spares the
 * frontend from rate-limit loops.
 */
export const whatsappRouter = Router();

// OPEN read (mirrors GET /api/dreams/, which is also open — private deployment).
whatsappRouter.get('/status', async (_req, res) => {
  const status = await whatsapp.getStatus();
  res.json({ ...status, adminEnabled: config.admin?.enabled ?? false });
});

/** Pairing QR as PNG base64 (admin). 404 if already connected or pairing is off. */
whatsappRouter.get('/qr', requireCloudflareAccess, async (_req, res) => {
  const png = await whatsapp.currentQrPng();
  if (!png) {
    res.status(404).json({ error: 'No QR code available (not in pairing mode)' });
    return;
  }
  // Raw base64 without `data:image/png;base64,` — the frontend sets the
  // MIME type itself, and without the prefix it can be wrapped trivially
  // into an `<img src="data:…">`.
  const b64 = png.replace(/^data:image\/png;base64,/, '');
  res.json({ qr: b64 });
});

/** Trigger reconnect (admin). Fire-and-forget; responds 202. */
whatsappRouter.post('/reconnect', requireCloudflareAccess, async (_req, res) => {
  void whatsapp.reconnect();
  res.status(202).json({ ok: true });
});

/** Test message to the first active recipient (admin). */
whatsappRouter.post('/test', requireCloudflareAccess, async (_req, res) => {
  const targets = listDeliveryTargets(true);
  if (targets.length === 0) {
    res.status(400).json({ error: 'No active recipient configured' });
    return;
  }
  const t = targets[0];
  try {
    await whatsapp.sendText(whatsapp.toJid(t.phone), 'meDiary Test ✅ — WhatsApp connection works.');
    res.json({ ok: true, recipient: t.phone });
  } catch (e) {
    res.status(503).json({ error: (e as Error).message });
  }
});

/** All recipients (admin; including deactivated ones for the UI table). */
whatsappRouter.get('/targets', requireCloudflareAccess, (_req, res) => {
  res.json({ targets: listDeliveryTargets(false) });
});

/** Create a recipient (admin). Phone is normalised to digits. */
whatsappRouter.post('/targets', requireCloudflareAccess, (req: Request, res: Response) => {
  const { phone, displayName } = req.body ?? {};
  if (typeof phone !== 'string' || !/^\+?\d{8,15}$/.test(phone.replace(/\s/g, ''))) {
    res.status(400).json({ error: 'phone must be 8-15 digits (with or without +)' });
    return;
  }
  const cleaned = phone.replace(/[^\d]/g, '');
  const row = insertDeliveryTarget('whatsapp', cleaned, typeof displayName === 'string' ? displayName : null);
  res.status(201).json({ target: row });
});