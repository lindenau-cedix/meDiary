import { Router, type Request, type Response } from 'express';
import * as whatsapp from '../lib/whatsapp.js';
import { config } from '../config.js';
import { requireCloudflareAccess } from '../lib/cloudflare_access.js';
import { listDeliveryTargets, insertDeliveryTarget } from '../db.js';

/**
 * WhatsApp-Verwaltung — Status & Pairing-Helfer (admin-geschützt) +
 * Empfänger-Liste (lesen offen, schreiben admin). Der Pairing-QR ist nur
 * sinnvoll, solange noch keine Session besteht; ein 404 mit klarer
 * Fehlermeldung erspart dem Frontend Rate-Limit-Schleifen.
 */
export const whatsappRouter = Router();

// OPEN read (spiegelt GET /api/dreams/, das auch offen ist — privates Deployment).
whatsappRouter.get('/status', async (_req, res) => {
  const status = await whatsapp.getStatus();
  res.json({ ...status, adminEnabled: config.admin?.enabled ?? false });
});

/** Pairing-QR als PNG-Base64 (admin). 404 wenn bereits verbunden oder Pairing aus. */
whatsappRouter.get('/qr', requireCloudflareAccess, async (_req, res) => {
  const png = await whatsapp.currentQrPng();
  if (!png) {
    res.status(404).json({ error: 'Kein QR-Code verfügbar (nicht im Pairing-Modus)' });
    return;
  }
  // Rohes Base64 ohne `data:image/png;base64,` — das Frontend setzt den
  // MIME-Type selbst, und ohne Prefix lässt es sich trivial in einen
  // `<img src="data:…">` packen.
  const b64 = png.replace(/^data:image\/png;base64,/, '');
  res.json({ qr: b64 });
});

/** Reconnect anstoßen (admin). Fire-and-forget; Antwort 202. */
whatsappRouter.post('/reconnect', requireCloudflareAccess, async (_req, res) => {
  void whatsapp.reconnect();
  res.status(202).json({ ok: true });
});

/** Test-Nachricht an den ersten aktiven Empfänger (admin). */
whatsappRouter.post('/test', requireCloudflareAccess, async (_req, res) => {
  const targets = listDeliveryTargets(true);
  if (targets.length === 0) {
    res.status(400).json({ error: 'Kein aktiver Empfänger konfiguriert' });
    return;
  }
  const t = targets[0];
  try {
    await whatsapp.sendText(whatsapp.toJid(t.phone), 'meDiary Test ✅ — WhatsApp-Verbindung funktioniert.');
    res.json({ ok: true, recipient: t.phone });
  } catch (e) {
    res.status(503).json({ error: (e as Error).message });
  }
});

/** Alle Empfänger (admin; inkl. deaktivierter für die UI-Tabelle). */
whatsappRouter.get('/targets', requireCloudflareAccess, (_req, res) => {
  res.json({ targets: listDeliveryTargets(false) });
});

/** Empfänger anlegen (admin). Phone wird auf Ziffern normalisiert. */
whatsappRouter.post('/targets', requireCloudflareAccess, (req: Request, res: Response) => {
  const { phone, displayName } = req.body ?? {};
  if (typeof phone !== 'string' || !/^\+?\d{8,15}$/.test(phone.replace(/\s/g, ''))) {
    res.status(400).json({ error: 'phone muss 8-15 Ziffern sein (mit oder ohne +)' });
    return;
  }
  const cleaned = phone.replace(/[^\d]/g, '');
  const row = insertDeliveryTarget('whatsapp', cleaned, typeof displayName === 'string' ? displayName : null);
  res.status(201).json({ target: row });
});