import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** server/ root directory (one level up from src/) */
export const SERVER_ROOT = path.resolve(__dirname, '..');

function resolveFromRoot(p: string): string {
  return path.isAbsolute(p) ? p : path.resolve(SERVER_ROOT, p);
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  dbPath: resolveFromRoot(process.env.DB_PATH ?? './data/mediary.db'),
  // DEFAULTS.md liegt im Projekt-Wurzelverzeichnis (eine Ebene über server/).
  defaultsPath: resolveFromRoot(process.env.DEFAULTS_PATH ?? '../DEFAULTS.md'),
  /** Optional path to a built web frontend (web/dist) to serve statically. */
  webDist: process.env.WEB_DIST ? resolveFromRoot(process.env.WEB_DIST) : null,
};
