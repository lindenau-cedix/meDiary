import { Router } from 'express';
import { METRICS } from '../lib/metrics.js';
import { nowLocalISO } from '../lib/time.js';

export const metaRouter = Router();

/** Die 11 Assessment-Metriken (Definition fürs Frontend). */
metaRouter.get('/metrics', (_req, res) => {
  res.json(METRICS);
});

metaRouter.get('/health', (_req, res) => {
  res.json({ ok: true, time: nowLocalISO(), service: 'mediary' });
});
