import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import './db.js'; // initialisiert Schema beim Import
import { backfillSubstancesFromIntakes } from './lib/substances.js';
import { substancesRouter } from './routes/substances.js';
import { intakesRouter } from './routes/intakes.js';
import { planRouter } from './routes/plan.js';
import { assessmentsRouter } from './routes/assessments.js';
import { defaultsRouter } from './routes/defaults.js';
import { metaRouter } from './routes/meta.js';

// Sicherstellen, dass jede jemals eingetragene Substanz eine QuickPick-Kachel
// bekommt (z. B. nach Importen). Idempotent, blockiert den Start praktisch nicht.
try {
  const { created, linked } = backfillSubstancesFromIntakes();
  if (created || linked) {
    console.log(`[mediary] Backfill: ${created} Substanzen angelegt, ${linked} Einnahmen verknüpft.`);
  }
} catch (e) {
  console.warn('[mediary] Substanz-Backfill fehlgeschlagen:', e);
}

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// API
app.use('/api', metaRouter);
app.use('/api/substances', substancesRouter);
app.use('/api/intakes', intakesRouter);
app.use('/api/plan', planRouter);
app.use('/api/assessments', assessmentsRouter);
app.use('/api/defaults', defaultsRouter);

// Optional: gebautes Frontend ausliefern (für Single-Deployment)
if (config.webDist && fs.existsSync(config.webDist)) {
  app.use(express.static(config.webDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(config.webDist!, 'index.html'));
  });
  console.log(`[mediary] Serving frontend from ${config.webDist}`);
}

// zentrale Fehlerbehandlung
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[mediary] error:', err);
  const message = err instanceof Error ? err.message : 'Interner Serverfehler';
  res.status(500).json({ error: message });
});

app.listen(config.port, () => {
  console.log(`[mediary] API läuft auf http://localhost:${config.port}`);
  console.log(`[mediary] DB: ${config.dbPath}`);
  console.log(`[mediary] DEFAULTS: ${config.defaultsPath}`);
});
