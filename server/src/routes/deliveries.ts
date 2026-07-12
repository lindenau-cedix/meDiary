import { Router } from 'express';
import { listDeliveries } from '../db.js';
import { serializeDelivery } from '../lib/serialize.js';

/**
 * Lese-Endpunkt für die Zustell-Historie. Analog zu `GET /api/dreams/`
 * offen (privates Deployment); die Admin-Aktionen (reconnect / test /
 * redeliver) liegen in den jeweiligen Sub-Routern und sind CF-Access-
 * geschützt.
 */
export const deliveriesRouter = Router();

deliveriesRouter.get('/', (req, res) => {
  const dreamDate = typeof req.query.dream_date === 'string' ? req.query.dream_date : undefined;
  const rawLimit = req.query.limit;
  const limit =
    typeof rawLimit === 'string' && rawLimit.length > 0
      ? Math.min(500, Math.max(1, Number(rawLimit)))
      : undefined;
  const rows = listDeliveries({ dreamDate, limit: Number.isFinite(limit) ? limit : undefined });
  res.json({ deliveries: rows.map(serializeDelivery) });
});